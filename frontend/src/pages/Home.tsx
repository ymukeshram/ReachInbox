import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDarkMode } from '../hooks/useDarkMode';
import PaymentModal from '../components/PaymentModal';
import NotificationToast from '../components/NotificationToast';

function Home() {
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);
  const [darkMode, setDarkMode] = useDarkMode();
  const [isVisible, setIsVisible] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'professional' | 'enterprise' | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' | 'info' | 'warning' } | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    setIsVisible(true);
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const features = [
    {
      icon: (
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      ),
      title: 'Smart Scheduling',
      description: 'Schedule thousands of emails in advance with precise timing controls. Set start times, inter-email delays, and hourly caps to stay within provider limits.',
      color: 'from-blue-500 to-cyan-500',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      text: 'text-blue-600 dark:text-blue-400',
    },
    {
      icon: (
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      title: 'Real-time Analytics',
      description: 'Track open rates, click rates, bounces, and delivery stats in real-time. Get actionable insights with beautiful charts and campaign-level breakdowns.',
      color: 'from-purple-500 to-pink-500',
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      text: 'text-purple-600 dark:text-purple-400',
    },
    {
      icon: (
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      title: 'Contact Management',
      description: 'Import contacts from CSV, tag and segment them, auto-suppress unsubscribes and hard bounces so your list stays clean and your sender score stays high.',
      color: 'from-green-500 to-emerald-500',
      bg: 'bg-green-50 dark:bg-green-900/20',
      text: 'text-green-600 dark:text-green-400',
    },
    {
      icon: (
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      ),
      title: 'Follow-up Sequences',
      description: 'Build multi-step email sequences that automatically follow up with leads. Set delays between steps and let Reachify handle the entire nurture journey.',
      color: 'from-orange-500 to-red-500',
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      text: 'text-orange-600 dark:text-orange-400',
    },
    {
      icon: (
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      title: 'Spam Score Checker',
      description: 'Get a real-time spam analysis of your subject line and body before sending. Our AI flags risky patterns so your emails land in the inbox, not spam.',
      color: 'from-yellow-500 to-amber-500',
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      text: 'text-yellow-600 dark:text-yellow-400',
    },
    {
      icon: (
        <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
        </svg>
      ),
      title: 'SMTP Rotation',
      description: 'Connect multiple SMTP accounts and Reachify automatically rotates between them to distribute sending load, improve deliverability, and avoid rate limits.',
      color: 'from-indigo-500 to-purple-500',
      bg: 'bg-indigo-50 dark:bg-indigo-900/20',
      text: 'text-indigo-600 dark:text-indigo-400',
    },
  ];

  const stats = [
    { value: '10M+', label: 'Emails Delivered' },
    { value: '99.9%', label: 'Platform Uptime' },
    { value: '35%', label: 'Avg Open Rate' },
    { value: '<100ms', label: 'API Response' },
  ];

  const steps = [
    {
      num: '01',
      title: 'Upload Your List',
      desc: 'Import a CSV or TXT file with email addresses. Add columns like name, company, role — Reachify auto-fills them into your email template.',
    },
    {
      num: '02',
      title: 'Compose & Schedule',
      desc: 'Write your email, set a start time, configure sending rate and hourly limits. Our spam checker flags issues before you hit send.',
    },
    {
      num: '03',
      title: 'Track & Optimise',
      desc: 'Monitor deliveries, opens, and bounces in real-time. Hard bounces and unsubscribes are auto-suppressed to keep your sender reputation clean.',
    },
  ];

  const testimonials = [
    {
      name: 'Priya Sharma',
      role: 'Marketing Director, TechCorp India',
      content: 'Reachify cut our outbound setup time from hours to minutes. Scheduling a 5,000-email campaign is now a 2-minute job. The spam checker alone saved us from a deliverability disaster.',
      initials: 'PS',
      color: 'from-blue-500 to-purple-500',
    },
    {
      name: 'Rahul Verma',
      role: 'CEO, StartupHub',
      content: 'We switched from Mailchimp and cut our monthly email bill by 70%. Reachify has all the features we need — scheduling, analytics, bounce management — at a price that makes sense for an Indian startup.',
      initials: 'RV',
      color: 'from-green-500 to-teal-500',
    },
    {
      name: 'Anita Desai',
      role: 'Growth Lead, E-commerce Plus',
      content: 'The SMTP rotation feature is a game changer. We connect three Gmail accounts and Reachify spreads the load automatically. Our deliverability went up 20% in the first week.',
      initials: 'AD',
      color: 'from-orange-500 to-red-500',
    },
  ];

  const faqs = [
    {
      q: 'How is Reachify different from Mailchimp or SendGrid?',
      a: 'Reachify is built specifically for cold outreach and bulk scheduling with your own SMTP accounts. You\'re not paying for a sending infrastructure you don\'t control — you bring your own Gmail, Outlook, or custom SMTP and Reachify handles the scheduling, personalisation, bounce tracking, and analytics.',
    },
    {
      q: 'Can I use my existing Gmail or Outlook account?',
      a: 'Yes. Add your Gmail (via App Password), Outlook, or any SMTP-compatible provider under SMTP Settings. Reachify will use it to send emails on your behalf. You can add multiple accounts and enable automatic rotation.',
    },
    {
      q: 'What happens to unsubscribes and bounced emails?',
      a: 'Every email automatically includes an unsubscribe link. When a contact unsubscribes or hard-bounces, they are permanently suppressed from all future campaigns — no manual cleanup needed.',
    },
    {
      q: 'Is there a free plan?',
      a: 'Yes. The Starter plan is free forever and includes 1,000 emails/month, analytics, CSV upload, and full dashboard access. No credit card required.',
    },
    {
      q: 'Are prices in Indian Rupees?',
      a: 'Yes. All plans are priced in INR and payments are processed via Razorpay. GST is applicable as per Indian tax laws.',
    },
    {
      q: 'How does personalisation work?',
      a: 'Include columns like first_name, last_name, company, role in your CSV. Then use {{first_name}}, {{company}} etc. in your subject or body — Reachify replaces them for each recipient automatically.',
    },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 transition-colors duration-300">

      {/* Navigation */}
      <nav className={`fixed top-0 w-full z-50 transition-all duration-300 ${scrollY > 20 ? 'bg-white/90 dark:bg-gray-950/90 backdrop-blur-xl shadow-sm border-b border-gray-100 dark:border-gray-800' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold text-lg shadow-md">
              R
            </div>
            <span className="text-xl font-bold text-gray-900 dark:text-white">Reachify</span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            {[['Features', '#features'], ['How It Works', '#how-it-works'], ['Pricing', '#pricing'], ['FAQ', '#faq']].map(([label, href]) => (
              <a key={label} href={href} className="text-sm text-gray-600 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium">
                {label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition"
              aria-label="Toggle dark mode"
            >
              {darkMode ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>
            <button
              onClick={() => navigate('/login')}
              className="hidden sm:block text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 transition"
            >
              Sign In
            </button>
            <button
              onClick={() => navigate('/login')}
              className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition shadow-sm hover:shadow-md"
            >
              Get Started Free
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-28 pb-24 px-6 bg-gradient-to-b from-blue-50/60 via-white to-white dark:from-gray-900 dark:via-gray-950 dark:to-gray-950">
        <div className="max-w-5xl mx-auto text-center">
          <div className={`inline-flex items-center gap-2 mb-6 px-4 py-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-full text-blue-700 dark:text-blue-300 text-sm font-medium transition-all duration-700 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            Built for Indian businesses · Priced in ₹ · Free to start
          </div>

          <h1 className={`text-5xl md:text-6xl lg:text-7xl font-extrabold mb-6 tracking-tight transition-all duration-700 delay-100 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <span className="text-gray-900 dark:text-white">Email outreach</span>
            <br />
            <span className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">at scale, finally.</span>
          </h1>

          <p className={`text-xl text-gray-600 dark:text-gray-400 mb-10 max-w-2xl mx-auto leading-relaxed transition-all duration-700 delay-200 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            Schedule thousands of personalised emails, track opens and clicks in real-time, and manage bounces automatically — all in one clean dashboard.
          </p>

          <div className={`flex flex-col sm:flex-row items-center justify-center gap-4 transition-all duration-700 delay-300 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <button
              onClick={() => navigate('/login')}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-8 py-4 rounded-xl text-base font-semibold shadow-lg hover:shadow-xl transition-all"
            >
              Start for Free — No Credit Card
            </button>
            <a
              href="#how-it-works"
              className="w-full sm:w-auto flex items-center justify-center gap-2 text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 font-medium transition"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              See how it works
            </a>
          </div>

          {/* Stats strip */}
          <div className={`mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 transition-all duration-700 delay-500 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            {stats.map((s, i) => (
              <div key={i} className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
                <p className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">{s.value}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-3">Platform Features</p>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Everything you need to reach your audience
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              From scheduling to analytics to bounce management — Reachify handles the full email lifecycle so you can focus on what you're writing, not how it's sent.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => (
              <div
                key={i}
                className="group bg-white dark:bg-gray-900 rounded-2xl p-7 border border-gray-100 dark:border-gray-800 hover:border-blue-200 dark:hover:border-blue-800 hover:shadow-lg transition-all duration-300"
              >
                <div className={`w-12 h-12 rounded-xl ${feature.bg} ${feature.text} flex items-center justify-center mb-5`}>
                  {feature.icon}
                </div>
                <h3 className="text-lg font-bold mb-2 text-gray-900 dark:text-white">{feature.title}</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-24 px-6 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-3">How It Works</p>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Up and running in under 5 minutes
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
              No complex setup, no developer required. Sign in with Google and schedule your first campaign in minutes.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {steps.map((step, i) => (
              <div key={i} className="relative">
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 left-full w-full h-px bg-gradient-to-r from-blue-200 to-transparent dark:from-blue-800 -translate-x-4" />
                )}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-7 border border-gray-100 dark:border-gray-700 h-full">
                  <span className="text-4xl font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">{step.num}</span>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white mt-3 mb-2">{step.title}</h3>
                  <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-24 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-3">Pricing</p>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Simple, honest pricing in ₹
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
              No per-email charges, no hidden fees. Pay a flat monthly rate and send as much as your plan allows. GST applicable.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 items-start">
            {[
              {
                name: 'Starter',
                price: '₹0',
                period: 'Free forever',
                desc: 'Perfect for individuals and small teams getting started with email outreach.',
                features: [
                  '1,000 emails / month',
                  'Basic analytics dashboard',
                  'CSV upload & personalisation',
                  'Bounce & unsubscribe tracking',
                  '1 SMTP account',
                  'Email support',
                ],
                cta: 'Get Started Free',
                plan: 'starter',
                popular: false,
              },
              {
                name: 'Professional',
                price: '₹3,999',
                period: '/ month',
                desc: 'For growing businesses running regular outbound campaigns at scale.',
                features: [
                  '50,000 emails / month',
                  'Advanced analytics & exports',
                  'Follow-up sequences',
                  'Multi-SMTP rotation',
                  'Spam score checker',
                  '5 users',
                  'Priority support (< 4 hr response)',
                  'API access',
                ],
                cta: 'Start 14-day Trial',
                plan: 'professional',
                popular: true,
              },
              {
                name: 'Enterprise',
                price: '₹14,999',
                period: '/ month',
                desc: 'For high-volume teams that need unlimited sending and dedicated support.',
                features: [
                  'Unlimited emails',
                  'All Professional features',
                  'Unlimited users',
                  'Dedicated account manager',
                  'Custom integrations & webhooks',
                  'White-label option',
                  '24/7 priority support',
                  'SLA: 99.9% uptime guarantee',
                ],
                cta: 'Contact Sales',
                plan: 'enterprise',
                popular: false,
              },
            ].map((plan, i) => (
              <div
                key={i}
                className={`relative bg-white dark:bg-gray-900 rounded-2xl p-8 border-2 transition-all duration-300 ${
                  plan.popular
                    ? 'border-blue-500 shadow-2xl shadow-blue-100 dark:shadow-blue-900/20 scale-105'
                    : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-xs font-bold px-5 py-1.5 rounded-full uppercase tracking-wider">
                    Most Popular
                  </div>
                )}
                <div className="mb-6">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-1">{plan.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">{plan.desc}</p>
                  <div className="flex items-baseline gap-1">
                    <span className="text-4xl font-extrabold text-gray-900 dark:text-white">{plan.price}</span>
                    <span className="text-gray-500 dark:text-gray-400 text-sm">{plan.period}</span>
                  </div>
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((f, j) => (
                    <li key={j} className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400">
                      <svg className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>

                <button
                  onClick={() => {
                    if (plan.plan === 'starter') navigate('/login');
                    else if (plan.plan === 'professional' || plan.plan === 'enterprise') setSelectedPlan(plan.plan as any);
                  }}
                  className={`w-full py-3.5 rounded-xl font-semibold text-sm transition-all duration-200 ${
                    plan.popular
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>

          <p className="text-center mt-8 text-sm text-gray-500 dark:text-gray-400">
            All plans billed monthly. Cancel anytime. GST applicable as per Indian tax laws.
          </p>
        </div>
      </section>

      {/* Testimonials */}
      <section id="testimonials" className="py-24 px-6 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-3">Customer Stories</p>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Teams that switched to Reachify
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-7 border border-gray-100 dark:border-gray-700 flex flex-col gap-4">
                <div className="flex gap-1">
                  {[...Array(5)].map((_, j) => (
                    <svg key={j} className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  ))}
                </div>
                <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed flex-1">"{t.content}"</p>
                <div className="flex items-center gap-3 pt-2 border-t border-gray-100 dark:border-gray-700">
                  <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${t.color} flex items-center justify-center text-white text-sm font-bold flex-shrink-0`}>
                    {t.initials}
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-gray-900 dark:text-white">{t.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-24 px-6">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-3">FAQ</p>
            <h2 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">Common questions</h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl overflow-hidden">
                <button
                  className="w-full flex items-center justify-between px-6 py-5 text-left"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span className="font-semibold text-gray-900 dark:text-white text-sm pr-4">{faq.q}</span>
                  <svg
                    className={`w-5 h-5 text-gray-400 flex-shrink-0 transition-transform ${openFaq === i ? 'rotate-180' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5 text-sm text-gray-600 dark:text-gray-400 leading-relaxed border-t border-gray-100 dark:border-gray-800 pt-4">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-20 px-6 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-3xl mx-auto text-center text-white">
          <h2 className="text-4xl font-bold mb-4">Ready to scale your outreach?</h2>
          <p className="text-blue-100 mb-8 text-lg">
            Join hundreds of Indian businesses already using Reachify to send smarter, faster email campaigns.
          </p>
          <button
            onClick={() => navigate('/login')}
            className="bg-white text-blue-600 px-8 py-4 rounded-xl font-bold text-base hover:shadow-2xl hover:scale-105 transition-all duration-300"
          >
            Get Started Free — No Credit Card
          </button>
          <p className="mt-4 text-sm text-blue-200">1,000 free emails/month · No commitment · Cancel anytime</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-950 text-white py-14 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-10 mb-10">
            <div className="md:col-span-1">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center font-bold text-sm">
                  R
                </div>
                <span className="text-lg font-bold">Reachify</span>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">
                Professional email outreach platform built for Indian businesses. Schedule, personalise, and track at scale.
              </p>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-4 text-gray-300 uppercase tracking-wider">Product</h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li><a href="#features" className="hover:text-white transition">Features</a></li>
                <li><a href="#pricing" className="hover:text-white transition">Pricing</a></li>
                <li><a href="#how-it-works" className="hover:text-white transition">How It Works</a></li>
                <li><a href="#faq" className="hover:text-white transition">FAQ</a></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-4 text-gray-300 uppercase tracking-wider">Use Cases</h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li><span className="hover:text-white transition cursor-default">Job Applications</span></li>
                <li><span className="hover:text-white transition cursor-default">Sales Outreach</span></li>
                <li><span className="hover:text-white transition cursor-default">Investor Outreach</span></li>
                <li><span className="hover:text-white transition cursor-default">Newsletter Campaigns</span></li>
              </ul>
            </div>

            <div>
              <h4 className="font-semibold text-sm mb-4 text-gray-300 uppercase tracking-wider">Legal</h4>
              <ul className="space-y-3 text-sm text-gray-400">
                <li><a href="#" className="hover:text-white transition">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-white transition">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white transition">Cookie Policy</a></li>
                <li><a href="#" className="hover:text-white transition">GDPR Compliance</a></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-gray-800 pt-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500">
            <p>© 2026 Reachify. All rights reserved. Made with care in India 🇮🇳</p>
            <p>Payments secured by Razorpay · GST applicable</p>
          </div>
        </div>
      </footer>

      {selectedPlan && (
        <PaymentModal
          plan={selectedPlan}
          onClose={() => setSelectedPlan(null)}
          onSuccess={() => {
            setNotification({ message: 'Payment successful! Your subscription is now active.', type: 'success' });
            setSelectedPlan(null);
            setTimeout(() => navigate('/dashboard'), 2000);
          }}
        />
      )}

      {notification && (
        <NotificationToast
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}
    </div>
  );
}

export default Home;
