import { useState, useEffect, useCallback, useRef } from 'react';
import {
  getContacts, importContacts, getTags, createTag, deleteTag,
  tagContacts, exportContacts, deleteContact
} from '../api';
import { friendlyError } from '../utils/friendlyError';
import { SkeletonTableRows } from './Skeleton';

interface Tag { id: string; name: string; color: string; contact_count?: number; }
interface Contact {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  subscribed: boolean;
  hard_bounced: boolean;
  tags: Tag[];
}

function ContactsView() {
  const [contacts, setContacts]   = useState<Contact[]>([]);
  const [tags, setTags]           = useState<Tag[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [total, setTotal]         = useState(0);
  const [page, setPage]           = useState(1);
  const [selected, setSelected]   = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importPct, setImportPct] = useState(0);
  const [newTagName, setNewTagName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const PAGE_SIZE = 50;

  const loadContacts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getContacts({ page, limit: PAGE_SIZE, search: search || undefined, tag: tagFilter || undefined });
      setContacts(Array.isArray(res.data?.data) ? res.data.data : []);
      setTotal(res.data?.total ?? 0);
    } catch {
      setError('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  }, [page, search, tagFilter]);

  const loadTags = useCallback(async () => {
    try {
      const res = await getTags();
      setTags(Array.isArray(res.data) ? res.data : []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadTags(); }, [loadTags]);
  useEffect(() => { const t = setTimeout(loadContacts, 300); return () => clearTimeout(t); }, [loadContacts]);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const handleImport = async (file: File) => {
    setImporting(true);
    setImportPct(0);
    setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await importContacts(fd, setImportPct);
      await loadContacts();
      await loadTags();
      if (res.data?.skipped > 0) {
        setError(`Imported ${res.data.imported}, skipped ${res.data.skipped} invalid row(s).`);
      }
    } catch (err: any) {
      setError(friendlyError(err, "Couldn't import that file. Please try again."));
    } finally {
      setImporting(false);
      setImportPct(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCreateTag = async () => {
    if (!newTagName.trim()) return;
    try {
      await createTag({ name: newTagName.trim() });
      setNewTagName('');
      await loadTags();
    } catch { setError('Failed to create tag'); }
  };

  const handleDeleteTag = async (id: string) => {
    if (!confirm('Delete this tag? It will be removed from all contacts.')) return;
    try {
      await deleteTag(id);
      if (tagFilter === id) setTagFilter('');
      await loadTags();
    } catch { setError('Failed to delete tag'); }
  };

  const handleBulkTag = async (tagId: string) => {
    if (selected.size === 0 || !tagId) return;
    try {
      await tagContacts({ contactIds: Array.from(selected), tagId, action: 'add' });
      setSelected(new Set());
      await loadContacts();
      await loadTags();
    } catch { setError('Failed to apply tag'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this contact?')) return;
    try {
      await deleteContact(id);
      await loadContacts();
    } catch { setError('Failed to delete contact'); }
  };

  return (
    <div className="space-y-4">
      {/* Tags row */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider mr-1">Tags</span>
          <button
            onClick={() => setTagFilter('')}
            className={`px-3 py-1 rounded-full text-xs font-medium transition ${!tagFilter ? 'bg-blue-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300'}`}
          >
            All
          </button>
          {tags.map(tag => (
            <span key={tag.id} className="inline-flex items-center gap-1">
              <button
                onClick={() => setTagFilter(tag.id)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition ${tagFilter === tag.id ? 'text-white' : 'text-gray-700 dark:text-gray-200'}`}
                style={{ backgroundColor: tagFilter === tag.id ? tag.color : `${tag.color}22` }}
              >
                {tag.name} {tag.contact_count !== undefined && `(${tag.contact_count})`}
              </button>
              <button onClick={() => handleDeleteTag(tag.id)} className="text-gray-300 hover:text-red-500 text-xs" title="Delete tag">✕</button>
            </span>
          ))}
          <div className="flex items-center gap-1 ml-auto">
            <input
              value={newTagName}
              onChange={e => setNewTagName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreateTag()}
              placeholder="New tag name"
              className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 w-36"
            />
            <button onClick={handleCreateTag} className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 rounded-lg text-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 transition">
              Add
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="text"
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          placeholder="Search contacts..."
          className="px-4 py-2 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:ring-2 focus:ring-blue-500 text-sm w-full sm:w-64"
        />
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {selected.size > 0 && (
            <select
              onChange={e => { handleBulkTag(e.target.value); e.target.value = ''; }}
              defaultValue=""
              className="px-3 py-2 text-sm border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none"
            >
              <option value="" disabled>Tag {selected.size} selected...</option>
              {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          <a
            href={exportContacts(tagFilter || undefined)}
            className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 transition shadow-sm"
          >
            Export CSV
          </a>
          <input ref={fileInputRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden"
            onChange={e => e.target.files?.[0] && handleImport(e.target.files[0])} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
            className="relative flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition shadow-sm disabled:opacity-90 overflow-hidden min-w-[112px] justify-center"
          >
            {importing && (
              <span
                className="absolute inset-y-0 left-0 bg-white/25 transition-all duration-200"
                style={{ width: `${importPct}%` }}
              />
            )}
            <span className="relative">{importing ? `Uploading ${importPct}%` : 'Import CSV'}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        {loading ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                  {['', 'Email', 'Name', 'Tags', 'Status', ''].map((h, i) => (
                    <th key={i} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <SkeletonTableRows rows={8} columns={['w-44', 'w-28', 'w-24', 'w-16']} withCheckbox />
              </tbody>
            </table>
          </div>
        ) : contacts.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="font-medium">No contacts yet</p>
            <p className="text-sm mt-1">Import a CSV to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                  <th className="px-5 py-3.5 text-left">
                    <input
                      type="checkbox"
                      checked={selected.size === contacts.length && contacts.length > 0}
                      onChange={() => setSelected(selected.size === contacts.length ? new Set() : new Set(contacts.map(c => c.id)))}
                      className="w-4 h-4 text-blue-600 rounded border-gray-300"
                    />
                  </th>
                  {['Email', 'Name', 'Tags', 'Status', ''].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {contacts.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-5 py-4">
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggleSelect(c.id)} className="w-4 h-4 text-blue-600 rounded border-gray-300" />
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-900 dark:text-gray-100 font-medium">{c.email}</td>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{[c.first_name, c.last_name].filter(Boolean).join(' ') || '—'}</td>
                    <td className="px-5 py-4">
                      <div className="flex flex-wrap gap-1">
                        {(c.tags || []).map(t => (
                          <span key={t.id} className="px-2 py-0.5 rounded-full text-xs font-medium" style={{ backgroundColor: `${t.color}22`, color: t.color }}>
                            {t.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      {c.hard_bounced ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Bounced</span>
                      ) : !c.subscribed ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">Unsubscribed</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">Subscribed</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <button onClick={() => handleDelete(c.id)} className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium transition">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 px-1">
          <span>{(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</span>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40">Prev</button>
            <button onClick={() => setPage(p => p + 1)} disabled={page * PAGE_SIZE >= total} className="px-3 py-1.5 border border-gray-200 dark:border-gray-700 rounded-lg disabled:opacity-40">Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ContactsView;
