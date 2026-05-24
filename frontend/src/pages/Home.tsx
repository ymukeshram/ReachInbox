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
  const [activeIndustry, setActiveIndustry] = useState(0);

  const industries = [
    {
      id: 'job-seekers',
      label: 'Job Seekers',
      icon: '🎯',
      color: 'blue',
      gradient: 'from-blue-500 to-cyan-500',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
      border: 'border-blue-500',
      text: 'text-blue-600 dark:text-blue-400',
      badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
      headline: 'Land your dream job, faster',
      subheadline: 'Stop applying into the void. Cold email the hiring manager directly.',
      description: 'Most job applications get lost in ATS. Reachify lets you find hiring managers and recruiters, personalise every email with their name and company, and automatically follow up if they don\'t reply — all without lifting a finger after the first setup.',
      bullets: [
        'Upload a CSV of 500+ companies and HR contacts in seconds',
        'Personalise every email with {{company}}, {{role}}, {{first_name}}',
        'Auto follow-up after 3 days if no reply — politely persistent',
        'Track exactly who opened your email and when',
        'Built-in spam checker so your email lands in inbox, not spam',
      ],
      stat: { value: '3×', label: 'more interview calls vs. job portals' },
      example: {
        subject: 'Quick question about the {{role}} role at {{company}}',
        body: 'Hi {{first_name}},\n\nI noticed {{company}} is hiring for {{role}}. I\'ve spent 3 years doing exactly this at [Previous Co] and would love to connect.\n\nWould a 15-min call work this week?\n\nBest,\nSumant',
      },
    },
    {
      id: 'edtech',
      label: 'EdTech',
      icon: '🎓',
      color: 'purple',
      gradient: 'from-purple-500 to-violet-500',
      bg: 'bg-purple-50 dark:bg-purple-900/20',
      border: 'border-purple-500',
      text: 'text-purple-600 dark:text-purple-400',
      badge: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
      headline: 'Fill every batch. Retain every student.',
      subheadline: 'Turn course inquiries into enrollments with automated nurture sequences.',
      description: 'EdTech platforms lose 60–70% of leads who never convert. Reachify helps you send personalised enrollment reminders, course recommendations, and re-engagement campaigns at scale — without a dedicated email marketing team.',
      bullets: [
        'Send batch announcements to 10,000 leads in minutes',
        'Personalise with {{student_name}}, {{course}}, {{discount_code}}',
        'Multi-step sequences: reminder → deadline alert → final offer',
        'Track open rates per campaign to see what messaging works',
        'Auto-suppress students who already enrolled',
      ],
      stat: { value: '45%', label: 'higher enrollment conversion rate' },
      example: {
        subject: '{{first_name}}, your spot in {{course}} closes in 48 hours',
        body: 'Hi {{first_name}},\n\nYou showed interest in {{course}} last week — just a heads up that only 12 seats remain and the batch starts Monday.\n\nUse code EARLY20 for ₹2,000 off. Link: [course_url]\n\nLet me know if you have questions!\n\nTeam Reachify Academy',
      },
    },
    {
      id: 'sales',
      label: 'Sales Teams',
      icon: '📈',
      color: 'green',
      gradient: 'from-green-500 to-emerald-500',
      bg: 'bg-green-50 dark:bg-green-900/20',
      border: 'border-green-500',
      text: 'text-green-600 dark:text-green-400',
      badge: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
      headline: 'Build pipeline. Close deals. Repeat.',
      subheadline: 'Turn cold prospects into warm leads with multi-touch email sequences.',
      description: 'B2B sales is a numbers game. Reachify lets your team send hundreds of personalised cold emails daily, automate follow-ups, rotate SMTP accounts to avoid spam filters, and track which prospects are engaging — so reps can focus on the warm ones.',
      bullets: [
        'Import prospect lists from LinkedIn exports or CRM CSV',
        'Multi-SMTP rotation across team accounts for higher deliverability',
        '5-step sequences: intro → value → case study → objection → breakup',
        'Real-time alerts when a prospect opens 3+ times (buy signal)',
        'Campaign-level analytics: open rate, reply rate, bounce rate',
      ],
      stat: { value: '2.7×', label: 'more pipeline from same-size team' },
      example: {
        subject: 'How {{company}} could save ₹4L/year on email costs',
        body: 'Hi {{first_name}},\n\nI noticed {{company}} is using Mailchimp — most companies your size end up overpaying by ₹3–5L/year.\n\nWe help {{industry}} companies cut email costs by 60% with better deliverability.\n\nOpen to a quick 20-min call?\n\nSumant | Reachify',
      },
    },
    {
      id: 'startups',
      label: 'Startups',
      icon: '🚀',
      color: 'orange',
      gradient: 'from-orange-500 to-amber-500',
      bg: 'bg-orange-50 dark:bg-orange-900/20',
      border: 'border-orange-500',
      text: 'text-orange-600 dark:text-orange-400',
      badge: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
      headline: 'Raise faster. Partner smarter.',
      subheadline: 'Cold email 500 investors in a weekend without burning your reputation.',
      description: 'Warm intros are great — but you can\'t always get one. Reachify lets founders send highly personalised investor outreach at scale, follow up automatically without being annoying, and track which investors opened the deck. No agency needed.',
      bullets: [
        'Personalise with {{investor_name}}, {{fund}}, {{portfolio_co}}',
        'Attach your pitch deck to every email in the batch',
        'Know instantly when an investor opens your email (real-time)',
        'Automated follow-up sequences — respectful, not spammy',
        'Separate campaigns for angels, VCs, and strategic partners',
      ],
      stat: { value: '12%', label: 'avg investor reply rate for personalised cold outreach' },
      example: {
        subject: 'Seed round — {{portfolio_co}} told us to reach out',
        body: 'Hi {{investor_name}},\n\nWe\'re building the Stripe for B2B email outreach in India — ₹2Cr ARR in 8 months, 200+ paying customers.\n\nKnowing your investment in {{portfolio_co}}, thought this might be relevant.\n\nDeck: [link] — 5 slides, 2 minutes.\n\nSumant, Reachify',
      },
    },
    {
      id: 'recruiters',
      label: 'Recruiters',
      icon: '🤝',
      color: 'pink',
      gradient: 'from-pink-500 to-rose-500',
      bg: 'bg-pink-50 dark:bg-pink-900/20',
      border: 'border-pink-500',
      text: 'text-pink-600 dark:text-pink-400',
      badge: 'bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300',
      headline: 'Source passive talent at scale.',
      subheadline: 'Reach 1,000 candidates before your competitor even shortlists 10.',
      description: 'The best candidates aren\'t applying on Naukri. Reachify helps recruiters and talent acquisition teams send personalised outreach to passive candidates at scale, automate follow-ups, and track engagement — filling positions weeks faster than traditional methods.',
      bullets: [
        'Import candidate lists from LinkedIn or internal databases',
        'Personalise with {{candidate_name}}, {{current_company}}, {{role}}',
        'Sequence: intro → role details → salary range → final nudge',
        'Track who opened (interested) vs. who ignored (move on)',
        'Auto-suppress candidates who replied or unsubscribed',
      ],
      stat: { value: '40%', label: 'faster time-to-hire vs. job board-only approach' },
      example: {
        subject: 'Are you open to a Senior {{role}} role at a funded startup?',
        body: 'Hi {{first_name}},\n\nI came across your profile and was impressed by your work at {{current_company}}.\n\nWe\'re hiring a Senior {{role}} at [Company] — fully remote, ₹30–40 LPA, ESOP included.\n\nIf you\'re open to hearing more, happy to share details. Takes 5 minutes.\n\nBest,\nSumant | [Agency]',
      },
    },
    {
      id: 'realestate',
      label: 'Real Estate',
      icon: '🏢',
      color: 'teal',
      gradient: 'from-teal-500 to-cyan-600',
      bg: 'bg-teal-50 dark:bg-teal-900/20',
      border: 'border-teal-500',
      text: 'text-teal-600 dark:text-teal-400',
      badge: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300',
      headline: 'List more. Sell faster.',
      subheadline: 'Blast property listings to 5,000 qualified buyers in under a minute.',
      description: 'Real estate runs on speed and relationships. Reachify lets agents and brokers blast new listings, announce open houses, and follow up with interested buyers — all personalised with property details, buyer names, and budget ranges.',
      bullets: [
        'Send new property alerts to your entire buyer database instantly',
        'Personalise with {{buyer_name}}, {{locality}}, {{budget_range}}',
        'Follow-up sequences for site visit → negotiation → closing',
        'Track which buyers opened and clicked for listing links',
        'Seasonal campaigns: Diwali offers, year-end clearance, etc.',
      ],
      stat: { value: '28%', label: 'more site visits from personalised listing emails' },
      example: {
        subject: '{{first_name}}, new 3BHK in {{locality}} — within your budget',
        body: 'Hi {{first_name}},\n\nA new 3BHK just listed in {{locality}} — ₹{{price}}L, 1,400 sq ft, ready to move.\n\nKnowing you were looking in this area under ₹{{budget}}L, thought you\'d want first look.\n\nSite visit this Saturday? I can arrange a private showing.\n\nSumant | Reachify Realty',
      },
    },
    {
      id: 'ecommerce',
      label: 'E-commerce',
      icon: '🛒',
      color: 'red',
      gradient: 'from-red-500 to-rose-600',
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-500',
      text: 'text-red-600 dark:text-red-400',
      badge: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
      headline: 'Recover revenue. Drive repeat purchases.',
      subheadline: 'Re-engage dormant buyers and recover abandoned carts at scale.',
      description: 'Over 70% of online carts are abandoned. Reachify helps e-commerce brands send personalised cart recovery emails, seasonal promotions, and loyalty campaigns — with precise scheduling and real-time tracking so you know exactly which email drove the sale.',
      bullets: [
        'Cart recovery sequences: 1hr → 24hr → 72hr with escalating offers',
        'Personalise with {{first_name}}, {{product}}, {{discount_code}}',
        'Seasonal blasts: Diwali, End of Season, Flash Sales in minutes',
        'Re-engagement for customers inactive 60+ days',
        'Track revenue attribution per email campaign',
      ],
      stat: { value: '15–20%', label: 'cart recovery rate with 3-step sequences' },
      example: {
        subject: '{{first_name}}, your {{product}} is waiting 🛒 — 10% off inside',
        body: 'Hi {{first_name}},\n\nYou left {{product}} in your cart. Here\'s a one-time 10% off to help you decide:\n\nCode: {{discount_code}} · Valid 24 hours\n\n[Complete my order]\n\nQuestions? Reply to this email — we\'re real humans.\n\nTeam [Brand]',
      },
    },
    {
      id: 'agencies',
      label: 'Agencies',
      icon: '🏛️',
      color: 'indigo',
      gradient: 'from-indigo-500 to-violet-600',
      bg: 'bg-indigo-50 dark:bg-indigo-900/20',
      border: 'border-indigo-500',
      text: 'text-indigo-600 dark:text-indigo-400',
      badge: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
      headline: 'Run client campaigns at agency scale.',
      subheadline: 'Manage outreach for 10 clients from one dashboard — no messy spreadsheets.',
      description: 'Agencies waste hours setting up separate tools for each client. Reachify lets you run personalised email campaigns for multiple clients under one account, with separate SMTP accounts per client, campaign-level analytics, and CSV/Excel imports straight from client CRM exports.',
      bullets: [
        'Separate SMTP per client — sender identity stays clean',
        'Upload client lists in CSV or Excel — no reformatting needed',
        'Personalise with {{client_name}}, {{company}}, {{campaign}}',
        'Campaign-level reporting to share with clients every week',
        'White-label email templates per client brand voice',
      ],
      stat: { value: '5×', label: 'more campaigns managed per account manager' },
      example: {
        subject: '{{first_name}}, a quick note from {{client_name}}',
        body: 'Hi {{first_name}},\n\nI\'m reaching out on behalf of {{client_name}} — we\'ve been helping {{industry}} companies like yours with {{solution}}.\n\nWould a 20-min intro call make sense this week?\n\nBest,\n{{sender_name}}\n[{{client_name}}]',
      },
    },
    {
      id: 'campus',
      label: 'Campus Placement',
      icon: '🎓',
      color: 'yellow',
      gradient: 'from-yellow-500 to-orange-500',
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      border: 'border-yellow-500',
      text: 'text-yellow-700 dark:text-yellow-400',
      badge: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300',
      headline: 'Get every student placed.',
      subheadline: 'Automate company outreach so your placement cell can focus on prep, not email.',
      description: 'Placement cells at colleges spend weeks manually emailing companies for JD approvals, PPT slots, and offer letters. Reachify lets you upload your target company list from Excel, personalise every outreach, and automatically follow up — so no opportunity slips through the cracks.',
      bullets: [
        'Import target company list from Excel directly — no CSV conversion',
        'Personalise with {{company}}, {{hr_name}}, {{batch_year}}, {{branch}}',
        'Automated follow-up if HR doesn\'t respond in 5 days',
        'Track which companies opened the JD request or PPT invite',
        'Separate campaigns for Day 1 companies vs. mass recruiters',
      ],
      stat: { value: '60%', label: 'faster company onboarding for placement season' },
      example: {
        subject: 'Campus Recruitment 2025 — {{company}} × [College Name]',
        body: 'Dear {{hr_name}},\n\nI\'m from the Placement Cell at [College Name]. We\'d love to invite {{company}} to recruit from our {{batch_year}} batch — {{student_count}} students across {{branch}}.\n\nOur students have placed at [Top Co 1], [Top Co 2] in previous years.\n\nWould you be open to a brief call to discuss the process?\n\nWarm regards,\nPlacement Coordinator\n[College Name]',
      },
    },
  ];

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
      description: 'Import contacts from CSV or Excel, tag and segment them, auto-suppress unsubscribes and hard bounces so your list stays clean and your sender score stays high.',
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
      title: 'Upload',
      desc: 'Import your audience from a CSV or Excel file. Columns like first_name, company, role are auto-detected and ready for personalisation.',
    },
    {
      num: '02',
      title: 'Personalize',
      desc: 'Write your email and insert dynamic tokens — {{first_name}}, {{company}}, {{role}}. Every recipient gets a unique, human-feeling message.',
    },
    {
      num: '03',
      title: 'Launch',
      desc: 'Set your start time, sending rate, and hourly cap. Our spam checker flags issues before you hit send — inbox, not junk.',
    },
    {
      num: '04',
      title: 'Reach',
      desc: 'Emails go out on schedule via your SMTP accounts with automatic rotation to maximise deliverability and stay within sending limits.',
    },
    {
      num: '05',
      title: 'Automate',
      desc: 'Build multi-step follow-up sequences. If a contact doesn\'t reply in N days, the next email goes out automatically — no manual chasing.',
    },
    {
      num: '06',
      title: 'Monitor',
      desc: 'Track opens, clicks, bounces, and campaign delivery in real-time. Hard bounces and unsubscribes are auto-suppressed to protect your sender reputation.',
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
      a: 'Include columns like first_name, last_name, company, role in your CSV or Excel file. Then use {{first_name}}, {{company}} etc. in your subject or body — Reachify replaces them for each recipient automatically.',
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
            {[['Features', '#features'], ['Use Cases', '#use-cases'], ['How It Works', '#how-it-works'], ['Pricing', '#pricing'], ['FAQ', '#faq']].map(([label, href]) => (
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
            Built for recruiters, enterprises, startups, agencies, EdTech platforms, and e-commerce businesses. Upload your audience via CSV or Excel, personalise every email, automate follow-ups, and monitor results — all in one dashboard.
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
              No complex setup, no developer required. Upload CSV or Excel, write your email, and launch your first campaign in under 5 minutes.
            </p>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {steps.map((step, i) => (
              <div key={i} className="bg-white dark:bg-gray-800 rounded-2xl p-7 border border-gray-100 dark:border-gray-700 h-full flex flex-col">
                <span className="text-4xl font-black bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">{step.num}</span>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mt-3 mb-2">{step.title}</h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Industry Use Cases */}
      <section id="use-cases" className="py-24 px-6 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 uppercase tracking-wider mb-3">Use Cases</p>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Built for every industry
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
              Whether you're a job seeker, a startup founder, or a sales team — Reachify adapts to your outreach goal.
            </p>
          </div>

          {/* Tab bar */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-10 scrollbar-hide justify-start md:justify-center">
            {industries.map((ind, i) => (
              <button
                key={ind.id}
                onClick={() => setActiveIndustry(i)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap transition-all duration-200 flex-shrink-0 border-2 ${
                  activeIndustry === i
                    ? `${ind.border} ${ind.bg} ${ind.text}`
                    : 'border-transparent bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <span className="text-base">{ind.icon}</span>
                {ind.label}
              </button>
            ))}
          </div>

          {/* Content panel */}
          {(() => {
            const ind = industries[activeIndustry];
            return (
              <div className="grid lg:grid-cols-2 gap-8 items-start">
                {/* Left: info */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 border border-gray-100 dark:border-gray-700 h-full">
                  <span className={`inline-block text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-4 ${ind.badge}`}>
                    {ind.icon} {ind.label}
                  </span>
                  <h3 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">{ind.headline}</h3>
                  <p className={`text-base font-medium mb-4 ${ind.text}`}>{ind.subheadline}</p>
                  <p className="text-gray-600 dark:text-gray-400 text-sm leading-relaxed mb-6">{ind.description}</p>

                  <ul className="space-y-3 mb-8">
                    {ind.bullets.map((b, j) => (
                      <li key={j} className="flex items-start gap-3 text-sm text-gray-700 dark:text-gray-300">
                        <span className={`mt-0.5 w-5 h-5 rounded-full bg-gradient-to-br ${ind.gradient} flex items-center justify-center flex-shrink-0`}>
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </span>
                        {b}
                      </li>
                    ))}
                  </ul>

                  {/* Stat highlight */}
                  <div className={`flex items-center gap-4 p-4 rounded-xl ${ind.bg} border ${ind.border} border-opacity-30`}>
                    <span className={`text-4xl font-black bg-gradient-to-r ${ind.gradient} bg-clip-text text-transparent`}>
                      {ind.stat.value}
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-400">{ind.stat.label}</span>
                  </div>
                </div>

                {/* Right: email preview */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm">
                  {/* Email client chrome */}
                  <div className="bg-gray-50 dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700 px-5 py-3 flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                    <span className="ml-3 text-xs text-gray-400 font-medium">Email Preview</span>
                  </div>

                  <div className="p-6">
                    {/* Subject line */}
                    <div className="mb-4 pb-4 border-b border-gray-100 dark:border-gray-700">
                      <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Subject</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white leading-snug">{ind.example.subject}</p>
                    </div>

                    {/* Body */}
                    <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed whitespace-pre-line font-mono bg-gray-50 dark:bg-gray-900/50 rounded-xl p-4 text-xs">
                      {ind.example.body}
                    </div>

                    {/* Personalisation tokens */}
                    <div className="mt-5">
                      <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wider">Personalisation tokens auto-filled per recipient</p>
                      <div className="flex flex-wrap gap-2">
                        {[...new Set([
                          ...(ind.example.subject.match(/\{\{[^}]+\}\}/g) || []),
                          ...(ind.example.body.match(/\{\{[^}]+\}\}/g) || []),
                        ])].map((token, k) => (
                          <span key={k} className={`text-xs font-mono px-2.5 py-1 rounded-lg font-semibold ${ind.badge}`}>
                            {token}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* CTA */}
                    <div className="mt-6 pt-5 border-t border-gray-100 dark:border-gray-700">
                      <button
                        onClick={() => navigate('/login')}
                        className={`w-full py-3 rounded-xl font-semibold text-sm text-white bg-gradient-to-r ${ind.gradient} hover:opacity-90 transition shadow-sm`}
                      >
                        Start your {ind.label} campaign free →
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
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
                  'CSV & Excel upload & personalisation',
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
                <li><a href="#use-cases" className="hover:text-white transition">Job Seekers</a></li>
                <li><a href="#use-cases" className="hover:text-white transition">EdTech</a></li>
                <li><a href="#use-cases" className="hover:text-white transition">Sales Teams</a></li>
                <li><a href="#use-cases" className="hover:text-white transition">Startups</a></li>
                <li><a href="#use-cases" className="hover:text-white transition">Recruiters</a></li>
                <li><a href="#use-cases" className="hover:text-white transition">Real Estate</a></li>
                <li><a href="#use-cases" className="hover:text-white transition">E-commerce</a></li>
                <li><a href="#use-cases" className="hover:text-white transition">Agencies</a></li>
                <li><a href="#use-cases" className="hover:text-white transition">Campus Placement</a></li>
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
