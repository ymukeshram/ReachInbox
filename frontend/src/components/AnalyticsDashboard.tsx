import { useMemo, ReactNode } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line,
} from 'recharts';
import { ScheduledEmail, SentEmail } from '../types';

interface Props {
  scheduledEmails: ScheduledEmail[];
  sentEmails: SentEmail[];
}

const STATUS_COLORS = {
  sent:      '#10b981',
  failed:    '#ef4444',
  scheduled: '#3b82f6',
};

function AnalyticsDashboard({ scheduledEmails, sentEmails }: Props) {
  const safeSent      = Array.isArray(sentEmails) ? sentEmails : [];
  const safeScheduled = Array.isArray(scheduledEmails) ? scheduledEmails : [];

  const stats = useMemo(() => {
    const sent      = safeSent.filter(e => e.status === 'sent').length;
    const failed    = safeSent.filter(e => e.status === 'failed').length;
    const cancelled = safeSent.filter(e => e.status === 'cancelled').length;
    const scheduled = safeScheduled.length;
    const total     = sent + failed + cancelled + scheduled;
    const hardBounce = safeSent.filter(e => e.bounce_type === 'hard').length;
    const softBounce = safeSent.filter(e => e.bounce_type === 'soft').length;
    const successRate  = (sent + failed) > 0 ? ((sent / (sent + failed)) * 100).toFixed(1) : '—';
    const bounceRate   = (sent + failed) > 0 ? (((hardBounce + softBounce) / (sent + failed)) * 100).toFixed(1) : '—';
    return { total, sent, failed, cancelled, scheduled, hardBounce, softBounce, successRate, bounceRate };
  }, [safeScheduled, safeSent]);

  const pieData = [
    { name: 'Sent',      value: stats.sent,      color: STATUS_COLORS.sent },
    { name: 'Failed',    value: stats.failed,     color: STATUS_COLORS.failed },
    { name: 'Scheduled', value: stats.scheduled,  color: STATUS_COLORS.scheduled },
  ].filter(d => d.value > 0);

  const dailyData = useMemo(() => {
    const days: Record<string, { sent: number; failed: number }> = {};
    safeSent.forEach(email => {
      if (!email.sent_at) return;
      try {
        const date = new Date(email.sent_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
        if (!days[date]) days[date] = { sent: 0, failed: 0 };
        if (email.status === 'sent')   days[date].sent++;
        else if (email.status === 'failed') days[date].failed++;
      } catch {}
    });
    return Object.entries(days).map(([date, d]) => ({ date, ...d })).slice(-14);
  }, [safeSent]);

  const hourlyData = useMemo(() => {
    const hours: Record<number, number> = {};
    safeSent.forEach(email => {
      if (!email.sent_at || email.status !== 'sent') return;
      try {
        const h = new Date(email.sent_at).getHours();
        hours[h] = (hours[h] || 0) + 1;
      } catch {}
    });
    return Array.from({ length: 24 }, (_, h) => ({
      hour: `${String(h).padStart(2, '0')}:00`,
      count: hours[h] || 0,
    }));
  }, [safeSent]);

  return (
    <div className="space-y-5">

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Processed"
          value={stats.total.toLocaleString()}
          sub="All statuses"
          color="blue"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          }
        />
        <StatCard
          label="Delivered"
          value={stats.sent.toLocaleString()}
          sub="Successfully sent"
          color="green"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />
        <StatCard
          label="Success Rate"
          value={stats.successRate === '—' ? '—' : `${stats.successRate}%`}
          sub={`${stats.failed} failed`}
          color="purple"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          }
        />
        <StatCard
          label="Bounce Rate"
          value={stats.bounceRate === '—' ? '—' : `${stats.bounceRate}%`}
          sub={`${stats.hardBounce} hard · ${stats.softBounce} soft`}
          color="red"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          }
        />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MiniStat label="Scheduled" value={stats.scheduled.toLocaleString()} color="text-blue-600 dark:text-blue-400" />
        <MiniStat label="Failed" value={stats.failed.toLocaleString()} color="text-red-600 dark:text-red-400" />
        <MiniStat label="Hard Bounces" value={stats.hardBounce.toLocaleString()} color="text-red-700 dark:text-red-500" />
        <MiniStat label="Soft Bounces" value={stats.softBounce.toLocaleString()} color="text-yellow-600 dark:text-yellow-400" />
      </div>

      {/* Charts row 1 */}
      <div className="grid lg:grid-cols-5 gap-5">
        <div className="lg:col-span-3 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-5">Daily Delivery Activity (last 14 days)</h3>
          {dailyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dailyData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 10, fontSize: 12 }}
                  labelStyle={{ color: '#e5e7eb' }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="sent"   fill={STATUS_COLORS.sent}   name="Delivered" radius={[4, 4, 0, 0]} />
                <Bar dataKey="failed" fill={STATUS_COLORS.failed} name="Failed"    radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <NoData />
          )}
        </div>

        <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-5">Status Distribution</h3>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={3} dataKey="value">
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 10, fontSize: 12 }}
                    labelStyle={{ color: '#e5e7eb' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-3 justify-center mt-2">
                {pieData.map((d, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-400">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                    {d.name}: {d.value.toLocaleString()}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <NoData />
          )}
        </div>
      </div>

      {/* Hourly chart */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-6 shadow-sm">
        <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-5">Send Volume by Hour of Day</h3>
        {hourlyData.some(d => d.count > 0) ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="hour" tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} interval={2} />
              <YAxis tick={{ fontSize: 10, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 10, fontSize: 12 }}
                labelStyle={{ color: '#e5e7eb' }}
              />
              <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={false} name="Emails sent" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <NoData />
        )}
      </div>
    </div>
  );
}

const colorMap: Record<string, { bg: string; text: string; sub: string }> = {
  blue:   { bg: 'bg-blue-50 dark:bg-blue-900/20',   text: 'text-blue-600 dark:text-blue-400',   sub: 'text-blue-500/70 dark:text-blue-400/70' },
  green:  { bg: 'bg-green-50 dark:bg-green-900/20', text: 'text-green-600 dark:text-green-400', sub: 'text-green-500/70 dark:text-green-400/70' },
  purple: { bg: 'bg-purple-50 dark:bg-purple-900/20', text: 'text-purple-600 dark:text-purple-400', sub: 'text-purple-500/70 dark:text-purple-400/70' },
  red:    { bg: 'bg-red-50 dark:bg-red-900/20',     text: 'text-red-600 dark:text-red-400',     sub: 'text-red-500/70 dark:text-red-400/70' },
};

function StatCard({ label, value, sub, color, icon }: {
  label: string; value: string; sub: string; color: string; icon: ReactNode;
}) {
  const c = colorMap[color];
  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wider">{label}</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
          <p className="text-xs text-gray-400 mt-1">{sub}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl ${c.bg} ${c.text} flex items-center justify-center flex-shrink-0`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-100 dark:border-gray-800 px-4 py-3 shadow-sm flex items-center justify-between">
      <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{label}</span>
      <span className={`text-sm font-bold ${color}`}>{value}</span>
    </div>
  );
}

function NoData() {
  return (
    <div className="h-48 flex flex-col items-center justify-center text-gray-300 dark:text-gray-700 gap-2">
      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <span className="text-sm">No data yet</span>
    </div>
  );
}

export default AnalyticsDashboard;
