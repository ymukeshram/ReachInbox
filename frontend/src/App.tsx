import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Login from './pages/Login';
import Dashboard from './pages/MailWorkspace';
import TopProgressBar from './components/TopProgressBar';
import { getUser } from './api';
import { User } from './types';

const devAuthBypass = import.meta.env.DEV && import.meta.env.VITE_DEV_AUTH_BYPASS === 'true';
const devUser: User = {
  id: 'dev-user',
  email: 'ymukeshram@gmail.com',
  name: 'Mukesh Ram',
  avatar: ''
};

function App() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const stored = localStorage.getItem('reachinbox_user');
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);
  const [startupPct, setStartupPct] = useState(4);

  useEffect(() => {
    if (devAuthBypass) {
      setUser(devUser);
      setStartupPct(100);
      setLoading(false);
      return;
    }

    const startedAt = Date.now();
    const startupTimeoutMs = 2000;
    const timeout = setTimeout(() => setLoading(false), startupTimeoutMs);
    const tick = setInterval(() => {
      setStartupPct(Math.min(96, Math.round(((Date.now() - startedAt) / startupTimeoutMs) * 100)));
    }, 100);

    getUser()
      .then((res) => {
        setUser(res.data);
        localStorage.setItem('reachinbox_user', JSON.stringify(res.data));
      })
      .catch(() => {
        // If API fails, keep user from localStorage if present
        if (!localStorage.getItem('reachinbox_user')) {
          setUser(null);
        }
      })
      .finally(() => {
        clearTimeout(timeout);
        clearInterval(tick);
        setStartupPct(100);
        setTimeout(() => setLoading(false), 150);
      });

    return () => {
      clearTimeout(timeout);
      clearInterval(tick);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
        <div className="flex flex-col items-center gap-5 text-center px-6 max-w-sm w-full">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-green-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg">
            R
          </div>
          <div>
            <p className="text-gray-800 dark:text-gray-200 font-semibold text-lg">Starting up ReachInbox</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
              Just a moment — we're getting everything ready.
            </p>
          </div>
          <div className="w-full max-w-[220px] h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-green-500 rounded-full transition-all duration-300 ease-out"
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
        <Route path="/" element={user ? <Navigate to="/dashboard" replace /> : <Login setUser={setUser} />} />
        <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <Login setUser={setUser} />} />
        <Route path="/dashboard" element={user ? <Dashboard user={user} setUser={(u) => { setUser(u); if(!u) localStorage.removeItem('reachinbox_user'); }} /> : <Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
