import { useState, useEffect, useCallback } from 'react';
import Header from '../components/Header';
import ComposeModal from '../components/ComposeModal';
import EmailPreviewModal from '../components/EmailPreviewModal';
import AnalyticsDashboard from '../components/AnalyticsDashboard';
import TemplatesModal from '../components/TemplatesModal';
import ContactsView from '../components/ContactsView';
import SequencesView from '../components/SequencesView';
import SettingsView from '../components/SettingsView';
import { Skeleton, SkeletonTableRows } from '../components/Skeleton';
import { ErrorBoundary } from '../utils/errorBoundary';
import { friendlyError } from '../utils/friendlyError';
import {
  getScheduledEmails, getSentEmails, bulkCancelEmails, getUser, getExportUrl,
  getCampaigns, cancelCampaign, getSubscription, getPermissions,
} from '../api';
import { User, ScheduledEmail, SentEmail, Campaign } from '../types';
import { useWebSocket } from '../hooks/useWebSocket';

interface DashboardProps {
  user: User;
  setUser: (user: User | null) => void;
}

type Tab = 'scheduled' | 'sent' | 'campaigns' | 'analytics' | 'contacts' | 'sequences' | 'settings';

function Dashboard({ user, setUser }: DashboardProps) {
  const [activeTab, setActiveTab]             = useState<Tab>('scheduled');
  const [showCompose, setShowCompose]         = useState(false);
  const [showTemplates, setShowTemplates]     = useState(false);
  const [templateToApply, setTemplateToApply] = useState<{ subject: string; body: string } | null>(null);
  const [previewEmail, setPreviewEmail]       = useState<ScheduledEmail | SentEmail | null>(null);
  const [scheduledEmails, setScheduledEmails] = useState<ScheduledEmail[]>([]);
  const [sentEmails, setSentEmails]           = useState<SentEmail[]>([]);
  const [campaigns, setCampaigns]             = useState<Campaign[]>([]);
  const [loading, setLoading]                 = useState(false);
  const [error, setError]                     = useState('');
  const [searchQuery, setSearchQuery]         = useState('');
  const [selectedEmails, setSelectedEmails]   = useState<Set<string>>(new Set());
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [subscription, setSubscription]       = useState<any>(null);
  const [permissions, setPermissions]         = useState<any>(null);

  // Pagination state
  const [scheduledPage, setScheduledPage]   = useState(1);
  const [sentPage, setSentPage]             = useState(1);
  const [scheduledTotal, setScheduledTotal] = useState(0);
  const [sentTotal, setSentTotal]           = useState(0);
  const [scheduledHasMore, setScheduledHasMore] = useState(false);
  const [sentHasMore, setSentHasMore]       = useState(false);
  const PAGE_SIZE = 50;

  // Keep session alive
  useEffect(() => {
    const keepAlive = () => {
      getUser().catch(() => { setUser(null); window.location.href = '/'; });
    };
    const interval = setInterval(keepAlive, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [setUser]);

  const loadEmails = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError('');
    try {
      if (activeTab === 'scheduled') {
        const res = await getScheduledEmails(scheduledPage, PAGE_SIZE);
        const data = res.data.data ?? res.data;
        setScheduledEmails(Array.isArray(data) ? data : []);
        setScheduledTotal(res.data.total ?? 0);
        setScheduledHasMore(res.data.hasMore ?? false);
      } else if (activeTab === 'sent') {
        const res = await getSentEmails(sentPage, PAGE_SIZE, searchQuery);
        const data = res.data.data ?? res.data;
        setSentEmails(Array.isArray(data) ? data : []);
        setSentTotal(res.data.total ?? 0);
        setSentHasMore(res.data.hasMore ?? false);
      } else if (activeTab === 'campaigns') {
        const res = await getCampaigns();
        const data = res.data.campaigns ?? res.data;
        setCampaigns(Array.isArray(data) ? data : []);
      }
    } catch (err: any) {
      if (err.response?.status === 401) {
        setError('Session expired. Redirecting...');
        setTimeout(() => { setUser(null); window.location.href = '/'; }, 2000);
      } else {
        setError('Failed to load data. Please refresh.');
      }
    } finally {
      setLoading(false);
    }
  }, [activeTab, scheduledPage, sentPage, searchQuery, setUser]);

  const handleEmailUpdate = useCallback((data: { emailId: string; status: string }) => {
    if (data.status === 'sent' || data.status === 'failed') loadEmails(false);
  }, [loadEmails]);

  useWebSocket(user.id, handleEmailUpdate);

  useEffect(() => {
    if (activeTab !== 'analytics') loadEmails(true);
  }, [activeTab, scheduledPage, sentPage, loadEmails]);

  // When switching to analytics, load up to 500 emails so charts have data
  useEffect(() => {
    if (activeTab !== 'analytics') return;
    Promise.all([
      getSentEmails(1, 500).then(res => {
        const d = res.data.data ?? res.data;
        setSentEmails(Array.isArray(d) ? d : []);
      }).catch(() => {}),
      getScheduledEmails(1, 500).then(res => {
        const d = res.data.data ?? res.data;
        setScheduledEmails(Array.isArray(d) ? d : []);
      }).catch(() => {}),
    ]);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'sent') {
      const t = setTimeout(() => loadEmails(false), 400);
      return () => clearTimeout(t);
    }
  }, [searchQuery]);

  useEffect(() => {
    const load = async () => {
      try {
        const [subRes, permRes] = await Promise.allSettled([
          getSubscription(),
          getPermissions(),
        ]);
        if (subRes.status === 'fulfilled') setSubscription(subRes.value.data);
        if (permRes.status === 'fulfilled') setPermissions(permRes.value.data);
      } catch {}
    };
    load();
  }, []);

  const filteredScheduledEmails = scheduledEmails.filter(e =>
    !searchQuery ||
    e.recipient_email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    e.subject.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const toggleEmailSelection = (id: string) => {
    setSelectedEmails(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleSelectAll = () => {
    setSelectedEmails(
      selectedEmails.size === filteredScheduledEmails.length && filteredScheduledEmails.length > 0
        ? new Set()
        : new Set(filteredScheduledEmails.map(e => e.id))
    );
  };

  const handleBulkCancel = async () => {
    if (selectedEmails.size === 0) return;
    if (!confirm(`Cancel ${selectedEmails.size} selected email(s)?`)) return;
    setBulkActionLoading(true);
    setError('');
    try {
      await bulkCancelEmails(Array.from(selectedEmails));
      setSelectedEmails(new Set());
      await loadEmails(false);
    } catch (err: any) {
      setError(friendlyError(err, "Couldn't cancel those emails. Please try again."));
      if (err.response?.data?.error === 'No scheduled emails to cancel') await loadEmails(false);
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleExport = () => {
    const url = getExportUrl(activeTab === 'sent' ? 'sent' : 'scheduled');
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleCancelCampaign = async (id: string, name: string) => {
    if (!confirm(`Cancel campaign "${name}"? All scheduled emails in this campaign will be cancelled.`)) return;
    try {
      await cancelCampaign(id);
      await loadEmails(false);
    } catch (err: any) {
      setError(friendlyError(err, "Couldn't cancel this campaign. Please try again."));
    }
  };

  const monthlyPct = permissions?.usage?.monthly?.limit > 0
    ? Math.min(100, (permissions.usage.monthly.used / permissions.usage.monthly.limit) * 100)
    : 0;
  const hourlyPct = permissions?.usage?.hourly?.limit > 0
    ? Math.min(100, (permissions.usage.hourly.used / permissions.usage.hourly.limit) * 100)
    : 0;

  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'scheduled', label: 'Scheduled', count: scheduledTotal || undefined },
    { id: 'sent', label: 'Sent', count: sentTotal || undefined },
    { id: 'campaigns', label: 'Campaigns' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'contacts', label: 'Contacts' },
    { id: 'sequences', label: 'Sequences' },
    { id: 'settings', label: 'Settings' },
  ];

  const isEmailTab = activeTab === 'scheduled' || activeTab === 'sent';
  const showComposeTools = activeTab !== 'contacts' && activeTab !== 'sequences' && activeTab !== 'settings';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
      <Header user={user} setUser={setUser} />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-5">

        {/* Quota / Subscription Banner */}
        {!permissions ? (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">
              <div className="flex items-center gap-3 min-w-fit">
                <Skeleton className="w-10 h-10 rounded-xl" />
                <div>
                  <Skeleton className="h-2.5 w-10 mb-2" />
                  <Skeleton className="h-4 w-16" />
                </div>
              </div>
              <div className="flex-1 min-w-44">
                <Skeleton className="h-3 w-28 mb-2" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
              <div className="flex-1 min-w-36">
                <Skeleton className="h-3 w-20 mb-2" />
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-4 sm:gap-6">

              {/* Plan badge */}
              <div className="flex items-center gap-3 min-w-fit">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider font-medium">Plan</p>
                  <p className="font-semibold text-gray-900 dark:text-white capitalize">{permissions.role}</p>
                </div>
              </div>

              {/* Monthly quota */}
              <div className="flex-1 min-w-44">
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5 font-medium">
                  <span>Monthly emails</span>
                  <span>
                    {permissions.usage.monthly.used.toLocaleString()} /{' '}
                    {permissions.usage.monthly.limit === -1 ? '∞' : permissions.usage.monthly.limit.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${monthlyPct > 80 ? 'bg-red-500' : monthlyPct > 60 ? 'bg-yellow-500' : 'bg-blue-500'}`}
                    style={{ width: `${permissions.usage.monthly.limit === -1 ? 10 : monthlyPct}%` }}
                  />
                </div>
              </div>

              {/* Hourly quota */}
              <div className="flex-1 min-w-36">
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5 font-medium">
                  <span>This hour</span>
                  <span>
                    {permissions.usage.hourly.used} /{' '}
                    {permissions.usage.hourly.limit === -1 ? '∞' : permissions.usage.hourly.limit}
                  </span>
                </div>
                <div className="h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${hourlyPct > 80 ? 'bg-red-500' : hourlyPct > 60 ? 'bg-yellow-500' : 'bg-green-500'}`}
                    style={{ width: `${permissions.usage.hourly.limit === -1 ? 10 : hourlyPct}%` }}
                  />
                </div>
              </div>

              {subscription?.plan === 'starter' && (
                <button
                  onClick={() => window.location.href = '/'}
                  className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap hover:shadow-md transition"
                >
                  Upgrade Plan
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tabs + Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-1 shadow-sm overflow-x-auto max-w-full">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSelectedEmails(new Set()); setSearchQuery(''); }}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap flex-shrink-0 transition-all ${
                  activeTab === tab.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                    activeTab === tab.id
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                  }`}>
                    {tab.count > 999 ? '999+' : tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {isEmailTab && (
              <div className="relative w-full sm:w-auto order-first">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search emails..."
                  className="pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm w-full sm:w-52 shadow-sm"
                />
                <svg className="w-4 h-4 absolute left-3 top-2.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            )}

            {isEmailTab && (
              <button
                onClick={handleExport}
                className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition shadow-sm"
                title="Export as CSV"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export
              </button>
            )}

            {showComposeTools && (
              <button
                onClick={() => setShowTemplates(true)}
                className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Templates
              </button>
            )}

            {showComposeTools && (
              <button
                onClick={() => setShowCompose(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition shadow-sm hover:shadow-md"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Compose
              </button>
            )}
          </div>
        </div>

        {/* Bulk cancel bar */}
        {selectedEmails.size > 0 && activeTab === 'scheduled' && (
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl px-5 py-3 flex items-center justify-between">
            <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
              {selectedEmails.size} email{selectedEmails.size !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={handleBulkCancel}
              disabled={bulkActionLoading}
              className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 transition"
            >
              {bulkActionLoading ? 'Cancelling...' : 'Cancel Selected'}
            </button>
          </div>
        )}

        {error && (
          <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm">
            {error}
          </div>
        )}

        {/* Main content */}
        {activeTab === 'analytics' ? (
          <ErrorBoundary>
            <AnalyticsDashboard scheduledEmails={scheduledEmails} sentEmails={sentEmails} />
          </ErrorBoundary>
        ) : activeTab === 'campaigns' ? (
          <CampaignsView
            campaigns={campaigns}
            loading={loading}
            onCancel={handleCancelCampaign}
          />
        ) : activeTab === 'contacts' ? (
          <ErrorBoundary>
            <ContactsView />
          </ErrorBoundary>
        ) : activeTab === 'sequences' ? (
          <ErrorBoundary>
            <SequencesView />
          </ErrorBoundary>
        ) : activeTab === 'settings' ? (
          <ErrorBoundary>
            <SettingsView permissions={permissions} />
          </ErrorBoundary>
        ) : (
          <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
            {loading ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px]">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                      {(activeTab === 'scheduled'
                        ? ['', 'Recipient', 'Subject', 'Scheduled At', 'Status', '']
                        : ['Recipient', 'Subject', 'Sent At', 'Status', 'Bounce']
                      ).map((h, i) => (
                        <th key={i} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <SkeletonTableRows
                      rows={8}
                      columns={activeTab === 'scheduled'
                        ? ['w-40', 'w-52', 'w-28', 'w-16', 'w-10']
                        : ['w-40', 'w-52', 'w-28', 'w-16', 'w-16']}
                      withCheckbox={activeTab === 'scheduled'}
                    />
                  </tbody>
                </table>
              </div>
            ) : activeTab === 'scheduled' ? (
              filteredScheduledEmails.length === 0 ? (
                <EmptyState
                  title={searchQuery ? 'No emails match your search' : 'No scheduled emails'}
                  desc={searchQuery ? 'Try a different keyword.' : 'Click Compose to schedule your first campaign.'}
                  icon="inbox"
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px]">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                          <th className="px-5 py-3.5 text-left">
                            <input
                              type="checkbox"
                              checked={selectedEmails.size === filteredScheduledEmails.length && filteredScheduledEmails.length > 0}
                              onChange={toggleSelectAll}
                              className="w-4 h-4 text-blue-600 rounded border-gray-300"
                            />
                          </th>
                          {['Recipient', 'Subject', 'Scheduled At', 'Status', ''].map(h => (
                            <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                        {filteredScheduledEmails.map(email => (
                          <tr key={email.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                            <td className="px-5 py-4">
                              <input type="checkbox" checked={selectedEmails.has(email.id)} onChange={() => toggleEmailSelection(email.id)} className="w-4 h-4 text-blue-600 rounded border-gray-300" />
                            </td>
                            <td className="px-5 py-4 text-sm text-gray-900 dark:text-gray-100 font-medium">{email.recipient_email}</td>
                            <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300 max-w-xs truncate">{email.subject}</td>
                            <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                              {new Date(email.scheduled_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}
                            </td>
                            <td className="px-5 py-4">
                              <StatusBadge status={email.status} />
                            </td>
                            <td className="px-5 py-4">
                              <button onClick={() => setPreviewEmail(email)} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium transition">
                                Preview
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    page={scheduledPage} total={scheduledTotal} pageSize={PAGE_SIZE} hasMore={scheduledHasMore}
                    onPrev={() => setScheduledPage(p => Math.max(1, p - 1))}
                    onNext={() => setScheduledPage(p => p + 1)}
                  />
                </>
              )
            ) : (
              sentEmails.length === 0 ? (
                <EmptyState
                  title={searchQuery ? 'No emails match your search' : 'No sent emails yet'}
                  desc={searchQuery ? 'Try a different keyword.' : 'Sent emails will appear here after your scheduled campaigns run.'}
                  icon="check"
                />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px]">
                      <thead>
                        <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                          {['Recipient', 'Subject', 'Sent At', 'Status', 'Bounce'].map(h => (
                            <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                        {sentEmails.map(email => (
                          <tr key={email.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors" title={email.error_message || ''}>
                            <td className="px-5 py-4 text-sm text-gray-900 dark:text-gray-100 font-medium">{email.recipient_email}</td>
                            <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300 max-w-xs truncate">{email.subject}</td>
                            <td className="px-5 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                              {email.sent_at
                                ? new Date(email.sent_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
                                : '—'}
                            </td>
                            <td className="px-5 py-4">
                              <StatusBadge status={email.status} />
                            </td>
                            <td className="px-5 py-4">
                              {email.bounce_type ? (
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${email.bounce_type === 'hard' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'}`}>
                                  {email.bounce_type === 'hard' ? 'Permanently undeliverable' : 'Temporarily undeliverable'}
                                </span>
                              ) : <span className="text-gray-300 dark:text-gray-600">—</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    page={sentPage} total={sentTotal} pageSize={PAGE_SIZE} hasMore={sentHasMore}
                    onPrev={() => setSentPage(p => Math.max(1, p - 1))}
                    onNext={() => setSentPage(p => p + 1)}
                  />
                </>
              )
            )}
          </div>
        )}
      </div>

      {showCompose   && (
        <ComposeModal
          onClose={() => { setShowCompose(false); setTemplateToApply(null); }}
          onSuccess={() => loadEmails(true)}
          initialTemplate={templateToApply}
        />
      )}
      {showTemplates && (
        <TemplatesModal
          onClose={() => setShowTemplates(false)}
          onSelect={(template) => {
            setTemplateToApply({ subject: template.subject, body: template.body });
            setShowTemplates(false);
            setShowCompose(true);
          }}
        />
      )}
      {previewEmail  && <EmailPreviewModal email={previewEmail} onClose={() => setPreviewEmail(null)} />}
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────── */

function CampaignsView({ campaigns, loading, onCancel }: {
  campaigns: Campaign[];
  loading: boolean;
  onCancel: (id: string, name: string) => void;
}) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                {['Campaign', 'Status', 'Emails', 'Sent', 'Failed', 'Success Rate', 'Created', ''].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <SkeletonTableRows rows={6} columns={['w-32', 'w-16', 'w-10', 'w-10', 'w-10', 'w-20', 'w-20', 'w-8']} />
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (campaigns.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-sm">
        <EmptyState
          title="No campaigns yet"
          desc="Campaigns are created automatically when you compose and schedule emails with a campaign name."
          icon="campaigns"
        />
      </div>
    );
  }

  const statusColor: Record<string, string> = {
    active:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    completed: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    paused:    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
              {['Campaign', 'Status', 'Emails', 'Sent', 'Failed', 'Success Rate', 'Created', ''].map(h => (
                <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
            {campaigns.map(c => (
              <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                <td className="px-5 py-4">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{c.name || 'Untitled campaign'}</p>
                </td>
                <td className="px-5 py-4">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${statusColor[c.status] || 'bg-gray-100 text-gray-600'}`}>
                    {c.status}
                  </span>
                </td>
                <td className="px-5 py-4 text-sm text-gray-700 dark:text-gray-300">{c.total_emails.toLocaleString()}</td>
                <td className="px-5 py-4 text-sm text-green-600 dark:text-green-400 font-medium">{c.sent.toLocaleString()}</td>
                <td className="px-5 py-4 text-sm text-red-500 dark:text-red-400">{c.failed > 0 ? c.failed.toLocaleString() : '—'}</td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden w-16">
                      <div className="h-full bg-green-500 rounded-full" style={{ width: `${c.success_rate}%` }} />
                    </div>
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{c.success_rate}%</span>
                  </div>
                </td>
                <td className="px-5 py-4 text-sm text-gray-400 whitespace-nowrap">
                  {new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </td>
                <td className="px-5 py-4">
                  {c.status === 'active' && (
                    <button
                      onClick={() => onCancel(c.id, c.name || 'this campaign')}
                      className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 font-medium transition"
                    >
                      Cancel
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    scheduled: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    sent:      'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    failed:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  };
  return (
    <span className={`inline-block px-2.5 py-0.5 text-xs font-semibold rounded-full capitalize ${map[status] || 'bg-gray-100 text-gray-600'}`}>
      {status}
    </span>
  );
}

function Pagination({ page, total, pageSize, hasMore, onPrev, onNext }: {
  page: number; total: number; pageSize: number; hasMore: boolean;
  onPrev: () => void; onNext: () => void;
}) {
  if (total <= pageSize) return null;
  const start = (page - 1) * pageSize + 1;
  const end   = Math.min(page * pageSize, total);
  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 dark:border-gray-800 text-sm text-gray-500 dark:text-gray-400">
      <span>Showing {start.toLocaleString()}–{end.toLocaleString()} of {total.toLocaleString()}</span>
      <div className="flex items-center gap-1">
        <button
          onClick={onPrev} disabled={page === 1}
          className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition text-xs font-medium"
        >
          ← Prev
        </button>
        <span className="px-3 py-1.5 text-xs font-semibold text-gray-700 dark:text-gray-300">{page}</span>
        <button
          onClick={onNext} disabled={!hasMore}
          className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 disabled:opacity-40 hover:bg-gray-50 dark:hover:bg-gray-800 transition text-xs font-medium"
        >
          Next →
        </button>
      </div>
    </div>
  );
}

function EmptyState({ title, desc, icon }: { title: string; desc: string; icon: 'inbox' | 'check' | 'campaigns' }) {
  return (
    <div className="py-20 flex flex-col items-center gap-4 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        {icon === 'inbox' && (
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        )}
        {icon === 'check' && (
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
        {icon === 'campaigns' && (
          <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
        )}
      </div>
      <div>
        <p className="text-base font-semibold text-gray-700 dark:text-gray-300">{title}</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 max-w-sm">{desc}</p>
      </div>
    </div>
  );
}

export default Dashboard;
