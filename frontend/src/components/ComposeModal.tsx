import { useState, useCallback, useEffect, useRef } from 'react';
import { scheduleEmails, checkSpamScore, getSequences } from '../api';

interface Props { onClose: () => void; onSuccess: () => void; }

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const ALLOWED_ATTACHMENTS = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png', 'image/jpeg'
];

function SpamBadge({ rating }: { rating: 'safe' | 'caution' | 'risky' }) {
  const map = {
    safe:    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    caution: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    risky:   'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[rating]}`}>
      {rating === 'safe' ? '✓ Low spam risk' : rating === 'caution' ? '⚠ Caution' : '✗ High spam risk'}
    </span>
  );
}

function ComposeModal({ onClose, onSuccess }: Props) {
  const [subject, setSubject]             = useState('');
  const [body, setBody]                   = useState('');
  const [csvFile, setCsvFile]             = useState<File | null>(null);
  const [attachmentFile, setAttachment]   = useState<File | null>(null);
  const [emailCount, setEmailCount]       = useState(0);
  const [startTime, setStartTime]         = useState('');
  const [delayBetweenEmails, setDelay]    = useState('10');
  const [hourlyLimit, setHourlyLimit]     = useState('200');
  const [campaignName, setCampaignName]   = useState('');
  const [sequenceId, setSequenceId]       = useState('');
  const [sequences, setSequences]         = useState<any[]>([]);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [successInfo, setSuccessInfo]     = useState<any>(null);
  const [isDragging, setIsDragging]       = useState(false);
  const [spamResult, setSpamResult]       = useState<{ score: number; rating: string; issues: string[] } | null>(null);
  const spamTimer                         = useRef<ReturnType<typeof setTimeout>>();

  // Load sequences for follow-up selection
  useEffect(() => {
    getSequences().then(r => setSequences(Array.isArray(r.data) ? r.data : [])).catch(() => {});
  }, []);

  // Debounced spam score check
  useEffect(() => {
    clearTimeout(spamTimer.current);
    if (!subject || !body) { setSpamResult(null); return; }
    spamTimer.current = setTimeout(async () => {
      try {
        const r = await checkSpamScore(subject, body);
        setSpamResult(r.data);
      } catch {}
    }, 800);
    return () => clearTimeout(spamTimer.current);
  }, [subject, body]);

  const processFile = useCallback((f: File) => {
    setCsvFile(f);
    const isExcel = f.name.endsWith('.xlsx') || f.name.endsWith('.xls');
    if (isExcel) {
      // Can't count emails client-side from binary xlsx — show placeholder
      setEmailCount(0);
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const matches = (ev.target?.result as string).match(EMAIL_REGEX) || [];
      setEmailCount(new Set(matches.map(m => m.toLowerCase())).size);
    };
    reader.readAsText(f);
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) processFile(f);
  }, [processFile]);

  const handleAttachmentChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!ALLOWED_ATTACHMENTS.includes(f.type)) { setError('Allowed: PDF, Word, PNG, JPG'); return; }
    if (f.size > 5 * 1024 * 1024) { setError('Attachment max 5 MB'); return; }
    setAttachment(f);
    setError('');
  }, []);

  const handleDragOver  = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); }, []);
  const handleDrop      = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const f = e.dataTransfer.files?.[0];
    const ok = f && (f.name.endsWith('.csv') || f.name.endsWith('.txt') || f.name.endsWith('.xlsx') || f.name.endsWith('.xls'));
    if (ok) processFile(f);
    else { setError('Please drop a CSV, Excel (.xlsx), or TXT file'); setTimeout(() => setError(''), 3000); }
  }, [processFile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!csvFile || loading) return;
    setError(''); setSuccessInfo(null); setLoading(true);

    const fd = new FormData();
    fd.append('subject',            subject);
    fd.append('body',               body);
    fd.append('file',               csvFile);
    fd.append('startTime',          startTime);
    fd.append('delayBetweenEmails', delayBetweenEmails);
    fd.append('hourlyLimit',        hourlyLimit);
    if (campaignName.trim()) fd.append('campaignName', campaignName.trim());
    if (sequenceId)          fd.append('sequenceId',   sequenceId);
    if (attachmentFile)      fd.append('attachment',   attachmentFile);

    try {
      const res = await scheduleEmails(fd);
      const { count, skipped = 0, filtered = 0, invalidEmails = [], spamScore } = res.data;
      setSuccessInfo({ count, skipped, filtered, invalidEmails, spamScore });
      onSuccess();
      setTimeout(onClose, 4000);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to schedule. Please try again.');
    } finally {
      setTimeout(() => setLoading(false), 1000);
    }
  };

  const inp = 'w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 transition';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between sticky top-0 bg-white dark:bg-gray-800 z-10">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Compose Email</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-lg text-sm">{error}</div>
          )}
          {successInfo && (
            <div className="px-4 py-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-sm space-y-1">
              <p className="font-semibold text-green-800 dark:text-green-300">Scheduled {successInfo.count.toLocaleString()} email{successInfo.count!==1?'s':''}!</p>
              {successInfo.skipped > 0  && <p className="text-green-700 dark:text-green-400">{successInfo.skipped} duplicate{successInfo.skipped!==1?'s':''} removed</p>}
              {successInfo.filtered > 0 && <p className="text-yellow-700 dark:text-yellow-400">{successInfo.filtered} filtered (unsubscribed / hard bounce)</p>}
              {successInfo.invalidEmails?.length > 0 && <p className="text-orange-700 dark:text-orange-400">{successInfo.invalidEmails.length} invalid email{successInfo.invalidEmails.length!==1?'s':''}</p>}
              {successInfo.spamScore && <p className="text-gray-600 dark:text-gray-400">Spam score: {successInfo.spamScore.score}/100 — {successInfo.spamScore.rating}</p>}
            </div>
          )}

          {/* Subject */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Subject</label>
              {spamResult && <SpamBadge rating={spamResult.rating as any} />}
            </div>
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
              className={inp} placeholder="Subject — use {{name}}, {{company}} for personalisation" required />
            {spamResult && spamResult.issues.length > 0 && (
              <ul className="mt-1 text-xs text-yellow-600 dark:text-yellow-400 space-y-0.5">
                {spamResult.issues.slice(0,3).map((issue, i) => <li key={i}>• {issue}</li>)}
              </ul>
            )}
          </div>

          {/* Body */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Body</label>
            <textarea value={body} onChange={e => setBody(e.target.value)}
              rows={6} className={inp} placeholder="Hi {{first_name}},&#10;&#10;I saw your role at {{company}}..." required />
            <p className="mt-1 text-xs text-gray-400">Variables auto-filled from CSV/Excel columns: {`{{first_name}} {{last_name}} {{company}} {{role}}`}</p>
          </div>

          {/* Campaign + Sequence row */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Campaign Name <span className="text-gray-400 font-normal text-xs">(optional)</span></label>
              <input type="text" value={campaignName} onChange={e => setCampaignName(e.target.value)}
                className={inp} placeholder="e.g. HR Outreach May 2026" maxLength={255} />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Follow-up Sequence <span className="text-gray-400 font-normal text-xs">(optional)</span></label>
              <select value={sequenceId} onChange={e => setSequenceId(e.target.value)} className={inp}>
                <option value="">None — send once</option>
                {sequences.map(s => <option key={s.id} value={s.id}>{s.name} ({s.step_count} steps)</option>)}
              </select>
            </div>
          </div>

          {/* File Upload */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Email List (CSV / Excel / TXT)</label>
            <div
              onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              className={`relative border-2 border-dashed rounded-lg p-5 text-center transition-all ${isDragging ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'}`}
            >
              <input type="file" accept=".csv,.txt,.xlsx,.xls" onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" required={!csvFile} />
              <div className="pointer-events-none">
                <svg className="w-9 h-9 mx-auto mb-2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                {csvFile
                  ? <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{csvFile.name}</p>
                  : <p className="text-sm text-gray-600 dark:text-gray-400">Drop CSV, Excel (.xlsx), or TXT — or click to browse</p>}
              </div>
            </div>
            {csvFile && (csvFile.name.endsWith('.xlsx') || csvFile.name.endsWith('.xls')) && (
              <p className="mt-1.5 text-sm text-blue-600 dark:text-blue-400 font-medium">
                Excel file selected — recipient count shown after scheduling
              </p>
            )}
            {emailCount > 0 && (
              <p className="mt-1.5 text-sm text-green-600 dark:text-green-400 font-medium">
                {emailCount.toLocaleString()} unique email{emailCount!==1?'s':''} detected
              </p>
            )}
          </div>

          {/* Attachment */}
          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">
              Attachment <span className="text-gray-400 font-normal text-xs">(optional — PDF, Word, PNG, JPG · max 5 MB)</span>
            </label>
            <div className="flex items-center gap-3">
              <label className="flex-1 cursor-pointer">
                <div className={`flex items-center gap-2 px-4 py-2 border rounded-lg text-sm ${attachmentFile ? 'border-green-400 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                  {attachmentFile ? attachmentFile.name : 'Attach file (e.g. resume.pdf)'}
                </div>
                <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={handleAttachmentChange} className="hidden" />
              </label>
              {attachmentFile && (
                <button type="button" onClick={() => setAttachment(null)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
              )}
            </div>
            <p className="mt-1 text-xs text-gray-400">Attachment sent with every email in this batch (ideal for resumes, brochures, certificates).</p>
          </div>

          {/* Schedule settings */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Start Time</label>
              <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} className={inp} required />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Delay (sec)</label>
              <input type="number" value={delayBetweenEmails} onChange={e => setDelay(e.target.value)}
                min="5" max="3600" className={inp} required />
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 block">Hourly Limit</label>
            <input type="number" value={hourlyLimit} onChange={e => setHourlyLimit(e.target.value)}
              min="1" max="500" className={inp} required />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="submit" disabled={loading}
              className="flex-1 bg-blue-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 transition">
              {loading && <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              {loading ? 'Scheduling...' : `Schedule ${emailCount > 0 ? emailCount.toLocaleString() + ' ' : ''}Email${emailCount !== 1 ? 's' : ''}`}
            </button>
            <button type="button" onClick={onClose}
              className="px-6 py-2.5 border border-gray-300 dark:border-gray-600 rounded-lg font-medium hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition">
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ComposeModal;
