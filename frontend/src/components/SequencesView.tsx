import { useState, useEffect, useCallback } from 'react';
import {
  getSequences, createSequence, getSequence, deleteSequence,
  enrollInSequence, getSequenceEnrollments
} from '../api';
import { friendlyError } from '../utils/friendlyError';
import { Skeleton, SkeletonTableRows } from './Skeleton';

type Condition = 'always' | 'no_open' | 'no_click' | 'opened' | 'clicked';

interface Step { subject: string; body: string; delay_days: number; condition: Condition; }
interface Sequence {
  id: string;
  name: string;
  step_count: number;
  enrollment_count: number;
  active_enrollments: number;
  created_at: string;
}
interface Enrollment {
  id: string;
  recipient_email: string;
  current_step: number;
  status: string;
  source_subject?: string;
  source_sent_at?: string;
  opened_at?: string;
}

const CONDITION_LABELS: Record<Condition, string> = {
  always: 'Always send',
  no_open: 'If not opened',
  no_click: 'If not clicked',
  opened: 'If opened',
  clicked: 'If clicked'
};

const emptyStep = (): Step => ({ subject: '', body: '', delay_days: 1, condition: 'always' });

function SequencesView() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getSequences();
      setSequences(Array.isArray(res.data) ? res.data : []);
    } catch {
      setError('Failed to load sequences');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this sequence? Active enrollments will stop.')) return;
    try {
      await deleteSequence(id);
      if (detailId === id) setDetailId(null);
      await load();
    } catch { setError('Failed to delete sequence'); }
  };

  if (detailId) {
    return <SequenceDetail id={detailId} onBack={() => { setDetailId(null); load(); }} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Sequences</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition shadow-sm"
        >
          New Sequence
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        {loading ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                  {['Name', 'Steps', 'Enrolled', 'Active', ''].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <SkeletonTableRows rows={5} columns={['w-36', 'w-8', 'w-10', 'w-10', 'w-16']} />
              </tbody>
            </table>
          </div>
        ) : sequences.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="font-medium">No sequences yet</p>
            <p className="text-sm mt-1">Create a multi-step follow-up sequence to nurture leads automatically.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                  {['Name', 'Steps', 'Enrolled', 'Active', ''].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {sequences.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
                    <td className="px-5 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                      <button onClick={() => setDetailId(s.id)} className="hover:text-blue-600 dark:hover:text-blue-400 transition text-left">
                        {s.name}
                      </button>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{s.step_count}</td>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{s.enrollment_count}</td>
                    <td className="px-5 py-4 text-sm text-gray-600 dark:text-gray-300">{s.active_enrollments}</td>
                    <td className="px-5 py-4 flex gap-3">
                      <button onClick={() => setDetailId(s.id)} className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm font-medium transition">
                        View
                      </button>
                      <button onClick={() => handleDelete(s.id)} className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 text-sm font-medium transition">
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

      {showCreate && (
        <CreateSequenceModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); load(); }}
        />
      )}
    </div>
  );
}

function CreateSequenceModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName]   = useState('');
  const [steps, setSteps] = useState<Step[]>([emptyStep()]);
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  const updateStep = (i: number, patch: Partial<Step>) =>
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, ...patch } : s));

  const addStep = () => steps.length < 5 && setSteps(prev => [...prev, emptyStep()]);
  const removeStep = (i: number) => setSteps(prev => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    setError('');
    if (!name.trim()) { setError('Sequence name is required'); return; }
    if (steps.some(s => !s.subject.trim() || !s.body.trim())) { setError('Every step needs a subject and body'); return; }
    setSaving(true);
    try {
      await createSequence({ name: name.trim(), steps });
      onCreated();
    } catch (err: any) {
      setError(friendlyError(err, "Couldn't create this sequence. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">New Sequence</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">✕</button>
          </div>

          {error && (
            <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm">
              {error}
            </div>
          )}

          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Sequence name"
            className="w-full px-4 py-2.5 border border-gray-200 dark:border-gray-700 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />

          <div className="space-y-4">
            {steps.map((step, i) => (
              <div key={i} className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Step {i + 1}</span>
                  {steps.length > 1 && (
                    <button onClick={() => removeStep(i)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
                  )}
                </div>
                <input
                  value={step.subject}
                  onChange={e => updateStep(i, { subject: e.target.value })}
                  placeholder="Subject"
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                />
                <textarea
                  value={step.body}
                  onChange={e => updateStep(i, { body: e.target.value })}
                  placeholder="Body"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 text-sm resize-none"
                />
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    Delay
                    <input
                      type="number"
                      min={0}
                      value={step.delay_days}
                      onChange={e => updateStep(i, { delay_days: Math.max(0, parseInt(e.target.value) || 0) })}
                      className="w-16 px-2 py-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    days
                  </label>
                  <select
                    value={step.condition}
                    onChange={e => updateStep(i, { condition: e.target.value as Condition })}
                    className="flex-1 px-2 py-1 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 text-xs"
                  >
                    {Object.entries(CONDITION_LABELS).map(([v, label]) => (
                      <option key={v} value={v}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>
            ))}
          </div>

          {steps.length < 5 && (
            <button onClick={addStep} className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium transition">
              + Add step ({steps.length}/5)
            </button>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold transition shadow-sm disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Sequence'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SequenceDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const [sequence, setSequence] = useState<any>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [enrollEmail, setEnrollEmail] = useState('');
  const [enrolling, setEnrolling] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [seqRes, enrollRes] = await Promise.all([
        getSequence(id),
        getSequenceEnrollments(id)
      ]);
      setSequence(seqRes.data);
      setEnrollments(Array.isArray(enrollRes.data?.data) ? enrollRes.data.data : []);
    } catch {
      setError('Failed to load sequence');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleEnroll = async () => {
    if (!enrollEmail.trim()) return;
    setEnrolling(true);
    setError('');
    try {
      await enrollInSequence(id, { recipientEmail: enrollEmail.trim() });
      setEnrollEmail('');
      await load();
    } catch (err: any) {
      setError(friendlyError(err, "Couldn't add that person. Please check the email and try again."));
    } finally {
      setEnrolling(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <Skeleton className="h-4 w-32" />
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm space-y-3">
          <Skeleton className="h-5 w-40" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" style={{ animationDelay: `${i * 60}ms` }} />
          ))}
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm space-y-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-9 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button onClick={onBack} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition">
        ← Back to sequences
      </button>

      {error && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 rounded-xl text-sm">
          {error}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm space-y-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{sequence?.name}</h2>
        <div className="space-y-2">
          {(sequence?.steps || []).map((step: Step, i: number) => (
            <div key={i} className="flex items-start gap-3 text-sm border border-gray-100 dark:border-gray-800 rounded-lg p-3">
              <span className="font-semibold text-gray-400 dark:text-gray-500 w-6">{i + 1}.</span>
              <div className="flex-1">
                <p className="font-medium text-gray-900 dark:text-gray-100">{step.subject}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  {step.delay_days === 0 ? 'Immediately' : `After ${step.delay_days} day(s)`} · {CONDITION_LABELS[step.condition]}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm space-y-4">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Enroll a recipient</h3>
        <div className="flex gap-2">
          <input
            value={enrollEmail}
            onChange={e => setEnrollEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleEnroll()}
            placeholder="recipient@example.com"
            className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 text-sm"
          />
          <button
            onClick={handleEnroll}
            disabled={enrolling}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold transition disabled:opacity-50"
          >
            {enrolling ? 'Enrolling...' : 'Enroll'}
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 overflow-hidden shadow-sm">
        <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Enrollments</h3>
        </div>
        {enrollments.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">No enrollments yet</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/60 border-b border-gray-100 dark:border-gray-800">
                  {['Recipient', 'Step', 'Status', 'Opened'].map(h => (
                    <th key={h} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {enrollments.map(e => (
                  <tr key={e.id}>
                    <td className="px-5 py-3 text-sm text-gray-900 dark:text-gray-100">{e.recipient_email}</td>
                    <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300">{e.current_step}</td>
                    <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300 capitalize">{e.status}</td>
                    <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-300">{e.opened_at ? new Date(e.opened_at).toLocaleString() : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default SequencesView;
