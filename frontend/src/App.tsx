import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Home from './pages/Home';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import { getUser } from './api';
import { User } from './types';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Show UI in max 60s for backend cold start
    const timeout = setTimeout(() => setLoading(false), 60000);

    getUser()
      .then((res) => setUser(res.data))
      .catch(() => setUser(null))
      .finally(() => { clearTimeout(timeout); setLoading(false); });

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
      clearInterval(sessionRefresh);
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-gray-950">
        <div className="flex flex-col items-center gap-5 text-center px-6 max-w-sm">
          <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-purple-600 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shadow-lg">
            R
          </div>
          <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <div>
            <p className="text-gray-800 dark:text-gray-200 font-semibold text-lg">Starting up Reachify</p>
            <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
              Free tier servers wake up on first request — this takes up to 60 seconds.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={user ? <Navigate to="/dashboard" /> : <Login />} />
        <Route path="/dashboard" element={user ? <Dashboard user={user} setUser={setUser} /> : <Navigate to="/" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
