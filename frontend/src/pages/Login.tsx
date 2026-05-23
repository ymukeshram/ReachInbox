import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_URL = import.meta.env.VITE_API_URL || '';

function Login() {
  const navigate = useNavigate();
  const [warming, setWarming] = useState(true);
  const [warmMsg, setWarmMsg] = useState('Connecting to server...');

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 12;

    const ping = async () => {
      try {
        const res = await fetch(`${API_URL}/health`, { signal: AbortSignal.timeout(8000) });
        if (res.ok) { setWarming(false); setWarmMsg(''); return; }
      } catch {}

      attempts++;
      if (attempts >= maxAttempts) { setWarming(false); setWarmMsg(''); return; }

      const remaining = Math.round((maxAttempts - attempts) * 5);
      setWarmMsg(`Waking up server... (~${remaining}s)`);
      setTimeout(ping, 5000);
    };

    ping();
  }, []);

  const handleGoogleLogin = () => {
    window.location.href = `${API_URL}/auth/google`;
  };

  const perks = [
    { icon: '📅', text: 'Schedule emails weeks in advance' },
    { icon: '👤', text: 'Personalise with CSV variables' },
    { icon: '📊', text: 'Real-time open & click tracking' },
    { icon: '🚫', text: 'Auto-suppress bounces & unsubscribes' },
    { icon: '🔄', text: 'Multi-SMTP rotation for deliverability' },
    { icon: '🇮🇳', text: 'Priced in ₹ — 70% cheaper than Mailchimp' },
  ];

  return (
    <div className="min-h-screen flex bg-white dark:bg-gray-950">

      {/* Left Brand Panel */}
      <div className="hidden lg:flex flex-col justify-between w-[46%] bg-gradient-to-br from-blue-600 via-blue-700 to-purple-700 p-12 text-white">
        <div>
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-blue-200 hover:text-white transition text-sm mb-14"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to home
          </button>

          <div className="flex items-center gap-3 mb-10">
            <div className="w-11 h-11 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center text-xl font-black">
              R
            </div>
            <span className="text-2xl font-bold">Reachify</span>
          </div>

          <h2 className="text-4xl font-extrabold leading-tight mb-4">
            Bulk email scheduling<br />made simple.
          </h2>
          <p className="text-blue-200 text-base mb-10 leading-relaxed">
            Schedule thousands of personalised emails, track performance in real-time, and automate follow-ups — all without writing a single line of code.
          </p>

          <ul className="space-y-4">
            {perks.map((p, i) => (
              <li key={i} className="flex items-center gap-3 text-sm text-blue-100">
                <span className="text-lg">{p.icon}</span>
                {p.text}
              </li>
            ))}
          </ul>
        </div>

        <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
          <p className="text-sm text-blue-100 italic leading-relaxed mb-4">
            "We switched from Mailchimp and cut our email bill by 70%. Reachify has everything we need at a price that actually makes sense for an Indian startup."
          </p>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-sm font-bold">RV</div>
            <div>
              <p className="text-sm font-semibold">Rahul Verma</p>
              <p className="text-xs text-blue-300">CEO, StartupHub</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Login Panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">

        {/* Mobile back link */}
        <div className="lg:hidden w-full max-w-md mb-6">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to home
          </button>
        </div>

        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mb-8">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center text-white font-bold">R</div>
            <span className="text-xl font-bold text-gray-900 dark:text-white">Reachify</span>
          </div>

          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Sign in to Reachify</h1>
            <p className="text-gray-500 dark:text-gray-400">
              Use your Google account to get started. No password needed.
            </p>
          </div>

          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-8 shadow-sm space-y-5">

            {warming && (
              <div className="flex items-center gap-3 text-sm text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 rounded-xl px-4 py-3 border border-blue-100 dark:border-blue-800">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <span>{warmMsg}</span>
              </div>
            )}

            <button
              onClick={handleGoogleLogin}
              disabled={warming}
              className="w-full flex items-center justify-center gap-3 bg-white dark:bg-gray-800 text-gray-800 dark:text-white px-5 py-3.5 rounded-xl border-2 border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-sm"
            >
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              {warming ? 'Please wait...' : 'Continue with Google'}
            </button>

            <div className="relative flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              <span className="text-xs text-gray-400 whitespace-nowrap">Secured by Google OAuth 2.0</span>
              <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
            </div>

            <p className="text-center text-xs text-gray-400 leading-relaxed">
              By continuing, you agree to our{' '}
              <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">Terms of Service</a>{' '}
              and{' '}
              <a href="#" className="text-blue-600 dark:text-blue-400 hover:underline">Privacy Policy</a>.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-3 gap-3">
            {[
              { label: 'Bank-level security', sub: 'OAuth 2.0' },
              { label: 'Free to start', sub: '1,000 emails/mo' },
              { label: '99.9% uptime', sub: 'SLA guaranteed' },
            ].map((item, i) => (
              <div key={i} className="bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-800 rounded-xl p-4 text-center">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300">{item.label}</p>
                <p className="text-xs text-gray-400 mt-0.5">{item.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Login;
