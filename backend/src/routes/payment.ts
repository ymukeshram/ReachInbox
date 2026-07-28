import { Router, Request, Response } from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { pool } from '../config/database';
import { isAuthenticated } from '../middleware/auth';
import { GRACE_PERIOD_DAYS } from '../middleware/rbac';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!
});

// Pricing plans in INR
const PLANS = {
  starter: {
    name: 'Starter',
    price: 0,
    emails: 1000,
    features: ['1,000 emails/month', 'Basic analytics', 'Email support', '1 user']
  },
  professional: {
    name: 'Professional',
    price: 399900, // ₹3,999 in paise
    emails: 50000,
    features: ['50,000 emails/month', 'Advanced analytics', 'Priority support', '5 users', 'Custom templates', 'API access']
  },
  enterprise: {
    name: 'Enterprise',
    price: 1499900, // ₹14,999 in paise
    emails: -1, // Unlimited
    features: ['Unlimited emails', 'Advanced analytics & exports', '24/7 priority support', 'Unlimited users', 'Custom integrations', 'Dedicated account manager']
  }
};

// Grants (or renews) a paid, non-trial subscription for a user. Shared by the
// browser-driven /verify-payment flow and the server-to-server /webhook flow,
// so both paths keep the subscriptions table in sync the same way.
async function grantSubscription(userId: string, plan: string): Promise<{ plan: string; startDate: Date; endDate: Date }> {
  const subscriptionId = uuidv4();
  const startDate = new Date();
  const endDate = new Date();
  endDate.setMonth(endDate.getMonth() + 1); // 1 month subscription

  await pool.query(
    `INSERT INTO subscriptions (id, user_id, plan, status, is_trial, start_date, end_date, created_at)
     VALUES ($1, $2, $3, 'active', false, $4, $5, NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       plan = EXCLUDED.plan,
       status = 'active',
       is_trial = false,
       start_date = EXCLUDED.start_date,
       end_date = EXCLUDED.end_date,
       updated_at = NOW()`,
    [subscriptionId, userId, plan, startDate, endDate]
  );

  return { plan, startDate, endDate };
}

// Create Razorpay order
router.post('/create-order', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { plan } = req.body;
    const user = req.user as any;

    if (!plan || !PLANS[plan as keyof typeof PLANS]) {
      return res.status(400).json({ error: 'Invalid plan selected' });
    }

    const selectedPlan = PLANS[plan as keyof typeof PLANS];

    if (selectedPlan.price === 0) {
      return res.status(400).json({ error: 'Starter plan is free, no payment required' });
    }

    // Create Razorpay order
    const options = {
      amount: selectedPlan.price, // Amount in paise
      currency: 'INR',
      receipt: `order_${uuidv4()}`,
      notes: {
        userId: user.id,
        plan: plan,
        planName: selectedPlan.name
      }
    };

    const order = await razorpay.orders.create(options);

    // Save order to database
    await pool.query(
      `INSERT INTO payment_orders (id, user_id, plan, amount, currency, status, razorpay_order_id, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [uuidv4(), user.id, plan, selectedPlan.price, 'INR', 'created', order.id]
    );

    logger.info({ userId: user.id, plan, orderId: order.id }, 'Payment order created');

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to create payment order');
    res.status(500).json({ error: 'Failed to create payment order' });
  }
});

// Start a no-charge 14-day trial. No Razorpay order is created and no card is
// charged — the user gets full plan access for 14 days, then automatically
// falls back to Starter (via the same expiry check /verify-payment relies on)
// unless they pay before then. Each user gets at most one trial ever: the
// subscriptions table has exactly one row per user (see grantSubscription),
// so any existing row — trial or paid — makes them ineligible for a new one.
router.post('/start-trial', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { plan } = req.body;
    const user = req.user as any;

    if (plan !== 'professional' && plan !== 'enterprise') {
      return res.status(400).json({ error: 'Trials are only available for the Professional and Enterprise plans' });
    }

    const existing = await pool.query('SELECT id FROM subscriptions WHERE user_id = $1', [user.id]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'You have already used your free trial or have an existing subscription' });
    }

    const subscriptionId = uuidv4();
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 14);

    try {
      await pool.query(
        `INSERT INTO subscriptions (id, user_id, plan, status, is_trial, start_date, end_date, created_at)
         VALUES ($1, $2, $3, 'active', true, $4, $5, NOW())`,
        [subscriptionId, user.id, plan, startDate, endDate]
      );
    } catch (err: any) {
      // Unique violation on user_id means a concurrent request already created
      // a subscription row for this user — treat it the same as "already used".
      if (err.code === '23505') {
        return res.status(400).json({ error: 'You have already used your free trial or have an existing subscription' });
      }
      throw err;
    }

    logger.info({ userId: user.id, plan }, 'Free trial started');

    res.json({
      success: true,
      message: `Your 14-day ${PLANS[plan as keyof typeof PLANS].name} trial has started.`,
      subscription: { plan, status: 'active', isTrial: true, startDate, endDate }
    });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to start trial');
    res.status(500).json({ error: 'Failed to start trial' });
  }
});

// Verify payment
router.post('/verify-payment', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const user = req.user as any;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment verification fields' });
    }

    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET!)
      .update(body.toString())
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      logger.warn({ userId: user.id, orderId: razorpay_order_id }, 'Payment signature verification failed');
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    // Get order details from database
    const orderResult = await pool.query(
      'SELECT * FROM payment_orders WHERE razorpay_order_id = $1 AND user_id = $2',
      [razorpay_order_id, user.id]
    );

    if (orderResult.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const order = orderResult.rows[0];

    // Idempotency guard: this exact order was already verified and granted once.
    // Without this, replaying the same (still-valid) signed payload would keep
    // renewing/extending the subscription indefinitely for free.
    if (order.status === 'completed') {
      const existing = await pool.query(
        'SELECT plan, start_date, end_date FROM subscriptions WHERE user_id = $1',
        [user.id]
      );
      return res.json({
        success: true,
        message: 'Payment already verified.',
        subscription: existing.rows[0] ? {
          plan: existing.rows[0].plan,
          startDate: existing.rows[0].start_date,
          endDate: existing.rows[0].end_date
        } : null
      });
    }

    // Update order status
    await pool.query(
      `UPDATE payment_orders 
       SET status = 'completed', razorpay_payment_id = $1, updated_at = NOW()
       WHERE razorpay_order_id = $2`,
      [razorpay_payment_id, razorpay_order_id]
    );

    // Create or update subscription
    const subscription = await grantSubscription(user.id, order.plan);

    logger.info({
      userId: user.id,
      plan: order.plan,
      paymentId: razorpay_payment_id
    }, 'Payment verified and subscription activated');

    res.json({
      success: true,
      message: 'Payment successful! Your subscription is now active.',
      subscription
    });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Payment verification failed');
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// Get current subscription
router.get('/subscription', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;

    const result = await pool.query(
      `SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );

    const graceMs = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
    const isExpired = result.rows.length > 0
      && result.rows[0].end_date
      && new Date(result.rows[0].end_date).getTime() + graceMs <= Date.now();

    if (result.rows.length === 0 || isExpired) {
      return res.json({
        plan: 'starter',
        status: isExpired ? 'expired' : 'active',
        features: PLANS.starter.features
      });
    }

    const subscription = result.rows[0];
    const planDetails = PLANS[subscription.plan as keyof typeof PLANS] || PLANS.starter;

    res.json({
      ...subscription,
      isTrial: subscription.is_trial === true,
      features: planDetails.features,
      emailLimit: planDetails.emails
    });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to fetch subscription');
    res.status(500).json({ error: 'Failed to fetch subscription' });
  }
});

// Razorpay server-to-server webhook — backs up /verify-payment for cases
// where the browser closes/crashes before the client-side handler runs.
// Requires RAZORPAY_WEBHOOK_SECRET to be set and the webhook URL + secret to
// be configured in the Razorpay dashboard (Settings -> Webhooks), pointed at
// POST <backend-url>/api/payment/webhook with the "payment.captured" event.
router.post('/webhook', async (req: Request, res: Response) => {
  try {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
      logger.error('RAZORPAY_WEBHOOK_SECRET is not configured; rejecting webhook call');
      return res.status(500).json({ error: 'Webhook not configured' });
    }

    const signature = req.headers['x-razorpay-signature'] as string | undefined;
    if (!signature || !req.rawBody) {
      return res.status(400).json({ error: 'Missing signature' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(req.rawBody)
      .digest('hex');

    if (expectedSignature !== signature) {
      logger.warn('Razorpay webhook signature verification failed');
      return res.status(400).json({ error: 'Invalid signature' });
    }

    const event = req.body;

    if (event.event === 'payment.captured') {
      const payment = event.payload?.payment?.entity;
      const orderId = payment?.order_id;
      const paymentId = payment?.id;

      if (orderId) {
        const orderResult = await pool.query(
          'SELECT * FROM payment_orders WHERE razorpay_order_id = $1',
          [orderId]
        );

        if (orderResult.rows.length > 0) {
          const order = orderResult.rows[0];

          if (order.status !== 'completed') {
            await pool.query(
              `UPDATE payment_orders SET status = 'completed', razorpay_payment_id = $1, updated_at = NOW()
               WHERE razorpay_order_id = $2`,
              [paymentId, orderId]
            );
            await grantSubscription(order.user_id, order.plan);
            logger.info({ userId: order.user_id, plan: order.plan, orderId }, 'Subscription granted via webhook reconciliation');
          }
        } else {
          logger.warn({ orderId }, 'Webhook payment.captured for unknown order');
        }
      }
    }

    res.json({ received: true });
  } catch (err: any) {
    logger.error({ error: err.message }, 'Webhook processing failed');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Get payment history
router.get('/history', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const user = req.user as any;

    const result = await pool.query(
      `SELECT id, plan, amount, currency, status, razorpay_payment_id, created_at
       FROM payment_orders 
       WHERE user_id = $1 AND status = 'completed'
       ORDER BY created_at DESC 
       LIMIT 50`,
      [user.id]
    );

    res.json(result.rows);
  } catch (err: any) {
    logger.error({ error: err.message }, 'Failed to fetch payment history');
    res.status(500).json({ error: 'Failed to fetch payment history' });
  }
});

export default router;
