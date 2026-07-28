import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

const LAST_UPDATED = '27 July 2026';

function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950">
      <header className="border-b border-gray-100 dark:border-gray-800 px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to home
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">
              R
            </div>
            <span className="font-bold text-gray-900 dark:text-white">Reachify</span>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-14">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{title}</h1>
        <p className="text-sm text-gray-400 dark:text-gray-500 mb-10">Last updated: {LAST_UPDATED}</p>

        <div className="space-y-8 text-gray-600 dark:text-gray-300 leading-relaxed [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-gray-900 [&_h2]:dark:text-white [&_h2]:mb-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
          {children}
        </div>

        <div className="mt-14 pt-8 border-t border-gray-100 dark:border-gray-800 text-sm text-gray-400 dark:text-gray-500">
          Questions about this policy? Reach us at{' '}
          <a href="mailto:support@reachify.in" className="text-blue-600 dark:text-blue-400 hover:underline">
            support@reachify.in
          </a>
          .
        </div>
      </main>
    </div>
  );
}

export function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy">
      <section>
        <h2>What we collect</h2>
        <p>When you use Reachify, we collect:</p>
        <ul>
          <li>Your name, email address, and profile picture from Google when you sign in with Google Sign-In</li>
          <li>The contacts you upload (name, email address, company, and any other columns in your CSV/Excel file) so we can send emails on your behalf</li>
          <li>The campaigns and messages you compose, which we transmit through our email delivery provider on your behalf</li>
          <li>Campaign content, schedules, and delivery/open/click activity for the emails you send</li>
          <li>Billing details processed by Razorpay when you subscribe to a paid plan — we never see or store your card number</li>
        </ul>
      </section>

      <section>
        <h2>How we use it</h2>
        <p>
          We use this information only to operate Reachify: sending your scheduled emails, showing you analytics on
          your campaigns, keeping you signed in, and processing your subscription payment. We do not sell your data
          or your contacts' data to anyone, and we do not use your contact lists for any purpose other than sending
          the campaigns you create.
        </p>
      </section>

      <section>
        <h2>Where it's stored</h2>
        <p>
          Your account data, contacts, and campaign data are stored in our database and are only accessible to you
          and to Reachify systems required to deliver the service. Session data is kept in Redis and expires
          automatically.
        </p>
      </section>

      <section>
        <h2>Third parties</h2>
        <p>We share the minimum data necessary with:</p>
        <ul>
          <li><strong>Google</strong> — for sign-in only</li>
          <li><strong>Razorpay</strong> — for processing subscription payments</li>
          <li><strong>Brevo</strong> — our email delivery provider, for sending your campaigns</li>
        </ul>
      </section>

      <section>
        <h2>Your choices</h2>
        <p>
          You can delete your uploaded contacts, campaigns, and templates at any time from within the app. To delete
          your account entirely or request a copy of your data, email us and we'll action it within a reasonable
          time.
        </p>
      </section>
    </LegalLayout>
  );
}

export function TermsOfService() {
  return (
    <LegalLayout title="Terms of Service">
      <section>
        <h2>Using Reachify</h2>
        <p>
          Reachify lets you upload contact lists, personalise and schedule emails, and track delivery, opens, and
          clicks. By using the service you agree to send only emails you have a legitimate reason to send, and to
          comply with applicable anti-spam and data protection laws in the jurisdictions you send to.
        </p>
      </section>

      <section>
        <h2>Acceptable use</h2>
        <p>You may not use Reachify to:</p>
        <ul>
          <li>Send unsolicited bulk email to recipients who haven't consented to be contacted, where consent is legally required</li>
          <li>Send spam, malware, phishing content, or anything illegal or deceptive</li>
          <li>Upload contact data you don't have the right to use</li>
        </ul>
        <p>We reserve the right to suspend accounts that violate these terms.</p>
      </section>

      <section>
        <h2>Plans and billing</h2>
        <p>
          Reachify offers a free Starter plan and paid Professional/Enterprise plans billed monthly through
          Razorpay. Paid plans may include a 14-day free trial with no card required; if you don't upgrade to a paid
          plan before the trial ends, your account automatically reverts to the Starter plan and no charge is made.
          Subscriptions renew monthly until cancelled.
        </p>
      </section>

      <section>
        <h2>Your content</h2>
        <p>
          You retain ownership of the contacts, templates, and campaign content you upload. You're responsible for
          the accuracy of your contact data and the content of the emails you send.
        </p>
      </section>

      <section>
        <h2>Availability</h2>
        <p>
          We aim for high uptime but Reachify is provided "as is" without guarantee of uninterrupted service.
          Scheduled emails may occasionally be delayed during maintenance or provider outages.
        </p>
      </section>

      <section>
        <h2>Changes to these terms</h2>
        <p>We may update these terms as the product evolves. Material changes will be reflected on this page.</p>
      </section>
    </LegalLayout>
  );
}

export function CookiePolicy() {
  return (
    <LegalLayout title="Cookie Policy">
      <section>
        <h2>Session cookie</h2>
        <p>
          Reachify sets a single essential cookie, <code>sessionId</code>, when you sign in. It keeps you logged in
          and is required for the app to function — there's no way to use Reachify without it. It expires
          automatically after 7 days of inactivity and is never used for advertising or tracking across other sites.
        </p>
      </section>

      <section>
        <h2>Local storage</h2>
        <p>
          We use your browser's local storage (not a cookie) to remember your light/dark mode preference. This
          stays on your device and is never sent to our servers.
        </p>
      </section>

      <section>
        <h2>Email tracking</h2>
        <p>
          Emails you send through Reachify include an open-tracking pixel and tracked links so you can see delivery,
          open, and click activity for your own campaigns. This applies to the emails you send to your contacts, not
          to your use of the Reachify website itself.
        </p>
      </section>

      <section>
        <h2>No third-party advertising cookies</h2>
        <p>Reachify does not use third-party advertising or analytics cookies on this website.</p>
      </section>
    </LegalLayout>
  );
}

export function GdprCompliance() {
  return (
    <LegalLayout title="GDPR Compliance">
      <section>
        <h2>Your rights</h2>
        <p>If you are located in the EU/EEA, or send email to contacts who are, you and they have the right to:</p>
        <ul>
          <li>Access the personal data we hold</li>
          <li>Correct inaccurate data</li>
          <li>Request deletion of your data ("right to be forgotten")</li>
          <li>Export your data in a portable format</li>
          <li>Object to how your data is processed</li>
        </ul>
      </section>

      <section>
        <h2>Your responsibility as a sender</h2>
        <p>
          Reachify is a tool that sends emails on your instruction. If you upload contacts based in the EU/EEA, you
          are the data controller for that contact data, and you're responsible for having a lawful basis (such as
          consent or legitimate interest) to email them. Reachify acts as a data processor on your behalf.
        </p>
      </section>

      <section>
        <h2>How to exercise your rights</h2>
        <p>
          Email us to request access, correction, deletion, or export of any data we hold about you or, if you are a
          recipient who wants a contact record removed from a Reachify user's list, forward us the email you
          received and we'll help route the request.
        </p>
      </section>

      <section>
        <h2>Data retention</h2>
        <p>
          We keep your account and contact data for as long as your account is active, plus a limited period after
          cancellation in case you return. You can delete contacts, campaigns, and templates yourself at any time.
        </p>
      </section>
    </LegalLayout>
  );
}
