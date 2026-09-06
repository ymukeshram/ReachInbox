import { useEffect, useMemo, useState } from 'react';
import ComposeModal from '../components/ComposeModal';
import { getScheduledEmails, getSentEmails, getSlackStatus, disconnectSlack, getSlackConnectUrl, logout } from '../api';
import { User, ScheduledEmail, SentEmail } from '../types';

interface Props {
  user: User;
  setUser: (user: User | null) => void;
}

type Tab = 'scheduled' | 'sent';
type Mail = ScheduledEmail | SentEmail;

function getMailTimestamp(m: Mail): string | null {
  if ('scheduled_at' in m && m.scheduled_at) return m.scheduled_at;
  if ('sent_at' in m && m.sent_at) return m.sent_at;
  return null;
}

export default function MailWorkspace({ user, setUser }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('scheduled');
  const [query, setQuery] = useState('');
  const [composeOpen, setComposeOpen] = useState(false);
  const [scheduled, setScheduled] = useState<ScheduledEmail[]>([]);
  const [sent, setSent] = useState<SentEmail[]>([]);
  const [selectedMail, setSelectedMail] = useState<Mail | null>(null);
  const [slackConnected, setSlackConnected] = useState(false);
  const [slackTeam, setSlackTeam] = useState<string | null>(null);
  const [starredIds, setStarredIds] = useState<Set<string>>(() => new Set());
  const [filterType, setFilterType] = useState<'all' | 'starred' | 'newest' | 'oldest'>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadMail = () => {
    getScheduledEmails(1, 50).then(response => setScheduled(response.data.data || response.data || [])).catch(() => setScheduled([]));
    getSentEmails(1, 50).then(response => setSent(response.data.data || response.data || [])).catch(() => setSent([]));
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadMail();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  useEffect(() => { loadMail(); }, []);

  useEffect(() => {
    getSlackStatus().then(response => {
      setSlackConnected(Boolean(response.data.connected));
      setSlackTeam(response.data.teamName || null);
    }).catch(() => {});
  }, []);

  const toggleSlack = async () => {
    if (!slackConnected) {
      window.location.href = getSlackConnectUrl();
      return;
    }
    await disconnectSlack().catch(() => {});
    setSlackConnected(false);
    setSlackTeam(null);
  };

  const toggleStar = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setStarredIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDeleteMail = (id: string) => {
    if (activeTab === 'scheduled') {
      setScheduled(prev => prev.filter(email => email.id !== id));
    } else {
      setSent(prev => prev.filter(email => email.id !== id));
    }
    if (selectedMail?.id === id) {
      setSelectedMail(null);
    }
  };

  const handleArchiveMail = (id: string) => {
    if (activeTab === 'scheduled') {
      setScheduled(prev => prev.filter(email => email.id !== id));
    } else {
      setSent(prev => prev.filter(email => email.id !== id));
    }
    if (selectedMail?.id === id) {
      setSelectedMail(null);
    }
  };

  const messages: Mail[] = activeTab === 'scheduled' ? scheduled : sent;
  const filteredMessages = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    let list: Mail[] = messages;

    if (normalized) {
      list = list.filter(message =>
        `${message.recipient_email} ${message.subject} ${message.body}`.toLowerCase().includes(normalized)
      );
    }

    if (filterType === 'starred') {
      list = list.filter(message => starredIds.has(message.id));
    } else if (filterType === 'oldest') {
      list = [...list].sort((a, b) => {
        const tsA = getMailTimestamp(a);
        const tsB = getMailTimestamp(b);
        const tA = tsA ? new Date(tsA).getTime() : 0;
        const tB = tsB ? new Date(tsB).getTime() : 0;
        return tA - tB;
      });
    } else if (filterType === 'newest') {
      list = [...list].sort((a, b) => {
        const tsA = getMailTimestamp(a);
        const tsB = getMailTimestamp(b);
        const tA = tsA ? new Date(tsA).getTime() : 0;
        const tB = tsB ? new Date(tsB).getTime() : 0;
        return tB - tA;
      });
    }

    if (filterType === 'all') {
      return [...list].sort((a, b) => {
        const aStarred = starredIds.has(a.id) ? 1 : 0;
        const bStarred = starredIds.has(b.id) ? 1 : 0;
        return bStarred - aStarred;
      });
    }

    return list;
  }, [messages, query, starredIds, filterType]);

  const displayEmail = user?.email || 'me@domain.com';
  const displayName = user?.name || (user?.email ? user.email.split('@')[0] : 'User');

  return (
    <main className={selectedMail ? 'mail-app detail-view' : 'mail-app'}>
      <aside className="mail-sidebar">
        <div className="brand-mark text-emerald-500 font-bold tracking-tight text-[15px] flex items-center gap-2" aria-label="ReachInbox">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
          ReachInbox
        </div>
        <div className="profile-card">
          <div className="profile-avatar">{displayName.slice(0, 1).toUpperCase()}</div>
          <div className="profile-copy">
            <strong>{displayName}</strong>
            <span>{displayEmail}</span>
          </div>
          <button className="chevron-button" aria-label="Open profile menu">v</button>
        </div>
        <button className="compose-button" onClick={() => setComposeOpen(true)}>Compose</button>

        <nav className="mail-nav" aria-label="Mailbox folders">
          <span className="nav-label">CORE</span>
          <button className={activeTab === 'scheduled' ? 'nav-item active' : 'nav-item'} onClick={() => { setActiveTab('scheduled'); setSelectedMail(null); }}>
            <span><span className="nav-icon"><ClockIcon /></span>Scheduled</span><em>{scheduled.length}</em>
          </button>
          <button className={activeTab === 'sent' ? 'nav-item active' : 'nav-item'} onClick={() => { setActiveTab('sent'); setSelectedMail(null); }}>
            <span><span className="nav-icon"><SendIcon /></span>Sent</span><em>{sent.length}</em>
          </button>
          <button className={slackConnected ? 'nav-item text-emerald-600 font-medium' : 'nav-item'} onClick={toggleSlack}>
            <span>
              <span className="nav-icon">
                <span className={`w-2.5 h-2.5 rounded-full inline-block ${slackConnected ? 'bg-emerald-500' : 'bg-gray-400'}`} />
              </span>
              {slackConnected ? `Slack: ${slackTeam || 'Gitam'}` : 'Connect Slack'}
            </span>
          </button>
        </nav>
        <button className="logout-link" onClick={() => { logout().catch(() => {}); localStorage.removeItem('reachinbox_user'); setUser(null); }}>Log out</button>
      </aside>

      <section className="mail-content">
        <header className="mail-toolbar relative">
          <div className="search-box">
            <SearchIcon />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search"
              aria-label="Search emails"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="text-gray-400 hover:text-gray-600 font-bold text-xs px-1"
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
          
          <div className="relative">
            <button
              className={`toolbar-icon p-1.5 rounded-lg transition-colors ${filterType !== 'all' ? 'text-emerald-600 bg-emerald-50 font-bold' : 'text-gray-500 hover:bg-gray-100'}`}
              aria-label="Filter emails"
              title="Filter options"
              onClick={() => setShowFilterMenu(prev => !prev)}
            >
              <FilterIcon />
            </button>

            {showFilterMenu && (
              <div className="absolute left-0 top-9 w-44 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-30 flex flex-col text-xs font-medium text-gray-700">
                <button
                  onClick={() => { setFilterType('all'); setShowFilterMenu(false); }}
                  className={`px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between ${filterType === 'all' ? 'text-emerald-600 font-semibold bg-emerald-50/60' : ''}`}
                >
                  All Emails {filterType === 'all' && '✓'}
                </button>
                <button
                  onClick={() => { setFilterType('starred'); setShowFilterMenu(false); }}
                  className={`px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between ${filterType === 'starred' ? 'text-emerald-600 font-semibold bg-emerald-50/60' : ''}`}
                >
                  ⭐ Starred Only {filterType === 'starred' && '✓'}
                </button>
                <button
                  onClick={() => { setFilterType('newest'); setShowFilterMenu(false); }}
                  className={`px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between ${filterType === 'newest' ? 'text-emerald-600 font-semibold bg-emerald-50/60' : ''}`}
                >
                  📅 Newest First {filterType === 'newest' && '✓'}
                </button>
                <button
                  onClick={() => { setFilterType('oldest'); setShowFilterMenu(false); }}
                  className={`px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between ${filterType === 'oldest' ? 'text-emerald-600 font-semibold bg-emerald-50/60' : ''}`}
                >
                  ⌛ Oldest First {filterType === 'oldest' && '✓'}
                </button>
              </div>
            )}
          </div>

          <button
            className="toolbar-icon p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            aria-label="Refresh emails"
            title="Refresh emails"
            onClick={handleRefresh}
          >
            <RefreshIcon className={isRefreshing ? 'animate-spin text-emerald-600' : ''} />
          </button>
        </header>
        <div className="mail-list-header">
          <h1>{activeTab === 'scheduled' ? 'Scheduled emails' : 'Sent emails'}</h1>
          <span>{filteredMessages.length} messages</span>
        </div>
        <div className={selectedMail ? 'mail-body detail-open' : 'mail-body'}>
        <div className="mail-list">
          {filteredMessages.length === 0 ? (
            <div className="empty-mailbox">
              <span>◌</span>
              <strong>No {activeTab} emails</strong>
              <p>Your email activity will appear here.</p>
            </div>
          ) : filteredMessages.map(message => (
            <MailRow
              key={message.id}
              message={message}
              activeTab={activeTab}
              selected={selectedMail?.id === message.id}
              onSelect={() => setSelectedMail(message)}
              isStarred={starredIds.has(message.id)}
              onToggleStar={(e) => toggleStar(message.id, e)}
            />
          ))}
        </div>
        {selectedMail && (
          <MailDetail
            message={selectedMail}
            onClose={() => setSelectedMail(null)}
            user={user}
            isStarred={starredIds.has(selectedMail.id)}
            onToggleStar={() => toggleStar(selectedMail.id)}
            onDelete={() => handleDeleteMail(selectedMail.id)}
            onArchive={() => handleArchiveMail(selectedMail.id)}
          />
        )}
        </div>
      </section>

      {composeOpen && (
        <ComposeModal
          userEmail={user?.email}
          onClose={() => setComposeOpen(false)}
          onSuccess={loadMail}
        />
      )}
    </main>
  );
}

function MailRow({ message, activeTab, selected, onSelect, isStarred, onToggleStar }: { message: Mail; activeTab: Tab; selected: boolean; onSelect: () => void; isStarred: boolean; onToggleStar: (e: React.MouseEvent) => void }) {
  const timeStr = getMailTimestamp(message);
  const preview = message.body ? message.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
  const date = timeStr ? new Date(timeStr) : new Date();

  return (
    <article className={selected ? 'mail-row selected' : 'mail-row'} onClick={onSelect}>
      <strong className="mail-row-recipient">To: {message.recipient_email}</strong>
      <span className={activeTab === 'scheduled' ? 'status-pill scheduled' : 'status-pill sent'}>
        {activeTab === 'scheduled' ? 'Scheduled' : 'Sent'}
      </span>
      <div className="mail-row-main">
        <strong className="mail-row-subject">{message.subject || 'No subject'}</strong>
        <span className="mail-row-separator">-</span>
        <span className="mail-row-preview">{preview || 'No message preview available.'}</span>
      </div>
      <span className="mail-row-date">{date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
      <button className="row-star" aria-label="Star email" onClick={onToggleStar}>
        <StarIcon filled={isStarred} />
      </button>
    </article>
  );
}

function MailDetail({
  message,
  onClose,
  user,
  isStarred,
  onToggleStar,
  onDelete,
  onArchive
}: {
  message: Mail;
  onClose: () => void;
  user: User;
  isStarred: boolean;
  onToggleStar: () => void;
  onDelete: () => void;
  onArchive: () => void;
}) {
  const timeStr = getMailTimestamp(message);
  const senderName = user?.name || 'Me';
  const senderEmail = user?.email || 'me@domain.com';
  const avatarInitial = senderName.slice(0, 1).toUpperCase();

  return (
    <article className="mail-detail">
      <header className="mail-detail-header">
        <button onClick={onClose} aria-label="Close email">←</button>
        <strong>{message.subject || 'No subject'}</strong>
        <div className="mail-detail-actions">
          <button aria-label="Star message" onClick={onToggleStar} title="Star email">
            <StarIcon filled={isStarred} />
          </button>
          <button aria-label="Archive message" onClick={onArchive} title="Archive email" className="hover:text-emerald-600 transition-colors">
            <ArchiveIcon />
          </button>
          <button aria-label="Delete message" onClick={onDelete} title="Delete email" className="hover:text-red-600 transition-colors">
            <TrashIcon />
          </button>
          <div className="detail-user-avatar">{avatarInitial}</div>
        </div>
      </header>
      <div className="mail-detail-meta">
        <div className="detail-sender-avatar">{avatarInitial}</div>
        <div className="detail-sender-copy">
          <div><strong>{senderName}</strong><span>&lt;{senderEmail}&gt;</span></div>
          <span>to {message.recipient_email} ⌄</span>
        </div>
        <time>{timeStr ? new Date(timeStr).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</time>
      </div>
      <div className="mail-detail-copy">
        {message.body ? (
          <div dangerouslySetInnerHTML={{ __html: message.body }} />
        ) : (
          <p className="text-gray-400 italic">No content in message body.</p>
        )}
      </div>
    </article>
  );
}

function SearchIcon() {
  return <svg aria-hidden="true" className="mail-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></svg>;
}

function FilterIcon() {
  return <svg aria-hidden="true" className="mail-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16l-6.2 7.2v5.3l-3.6 1.8v-7.1L4 5Z" /></svg>;
}

function RefreshIcon({ className = '' }: { className?: string }) {
  return <svg aria-hidden="true" className={`refresh-symbol ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 5v6h-6" /></svg>;
}

function ClockIcon() {
  return <svg aria-hidden="true" className="mail-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" /></svg>;
}

function SendIcon() {
  return <svg aria-hidden="true" className="mail-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 18-8-8 18-2.8-7.2L3 11Z" /><path d="M10.2 13.8 21 3" /></svg>;
}

function StarIcon({ filled }: { filled?: boolean }) {
  return <svg aria-hidden="true" className="mail-symbol" viewBox="0 0 24 24" fill={filled ? "#f59e0b" : "none"} stroke={filled ? "#f59e0b" : "currentColor"} strokeWidth="1.6" strokeLinejoin="round"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" /></svg>;
}

function ArchiveIcon() {
  return <svg aria-hidden="true" className="detail-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16v13H4zM3 4h18v3H3zM9 11h6" /></svg>;
}

function TrashIcon() {
  return <svg aria-hidden="true" className="detail-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 7h14M10 4h4l1 3H9l1-3ZM7 7l1 13h8l1-13M10 10v6M14 10v6" /></svg>;
}
