import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { PrivacyPolicy, TermsOfService, CookiePolicy, GdprCompliance } from './pages/Legal';
import TopProgressBar from './components/TopProgressBar';
import { getUser } from './api';
import { User } from './types';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [startupPct, setStartupPct] = useState(4);

  useEffect(() => {
    // Show UI in max 60s for backend cold start
    const startedAt = Date.now();
    const timeout = setTimeout(() => setLoading(false), 60000);
    const tick = setInterval(() => {
      setStartupPct(Math.min(96, Math.round(((Date.now() - startedAt) / 60000) * 100)));
    }, 300);

    getUser()
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => {
        clearTimeout(timeout);
        clearInterval(tick);
        setStartupPct(100);
        setTimeout(() => setLoading(false), 150);
      });

    // Keep session alive - refresh every 5 minutes
    const sessionRefresh = setInterval(() => {
      if (window.location.pathname === '/dashboard') {
        getUser()
          .then((res) => setUser(res.data))
          .catch(() => {
            // Session expired, redirect to login
            setUser(null);
            window.location.href = '/';
          });
      }
    }, 5 * 60 * 1000); // 5 minutes

    return () => {
      clearTimeout(timeout);
      clearInterval(tick);
      clearInterval(sessionRefresh);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
        <div className="flex flex-col items-center gap-5 text-center px-6 max-w-sm w-full">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg">
            R
          </div>
          <div>
            <p className="text-gray-800 dark:text-gray-200 font-semibold text-lg">Starting up Reachify</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
              Just a moment — we're getting everything ready (up to 60 seconds).
            </p>
          </div>
          <div className="w-full max-w-[220px] h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${startupPct}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <TopProgressBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
        <Route path="/dashboard" element={user ? <Dashboard user={user} setUser={setUser} /> : <Navigate to="/" replace />} />
        <Route path="/privacy-policy" element={<PrivacyPolicy />} />
        <Route path="/terms-of-service" element={<TermsOfService />} />
        <Route path="/cookie-policy" element={<CookiePolicy />} />
        <Route path="/gdpr-compliance" element={<GdprCompliance />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
