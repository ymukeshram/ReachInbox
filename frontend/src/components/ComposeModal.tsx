import { useState, useCallback, useEffect, useRef } from 'react';
import { scheduleEmails, checkSpamScore, getSequences } from '../api';
import { friendlyError } from '../utils/friendlyError';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
  initialTemplate?: { subject: string; body: string } | null;
  userEmail?: string;
}

const EMAIL_REGEX = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const ALLOWED_ATTACHMENTS = [
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png', 'image/jpeg'
];

export default function ComposeModal({ onClose, onSuccess, initialTemplate, userEmail }: Props) {
  const [subject, setSubject]             = useState(initialTemplate?.subject ?? '');
  const [body, setBody]                   = useState(initialTemplate?.body ?? '');
  const [csvFile, setCsvFile]             = useState<File | null>(null);
  const [attachmentFile, setAttachment]   = useState<File | null>(null);
  const [emails, setEmails]               = useState<string[]>([]);
  
  const [startTime, setStartTime]         = useState('');
  const [delayBetweenEmails, setDelay]    = useState('00');
  const [hourlyLimit, setHourlyLimit]     = useState('00');
  
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [successInfo, setSuccessInfo]     = useState<any>(null);
  const [isDragging, setIsDragging]       = useState(false);
  
  const [showSendLater, setShowSendLater] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (editorRef.current && initialTemplate?.body) {
      editorRef.current.innerHTML = initialTemplate.body;
    }
  }, []);

  const applyFormat = useCallback((command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    if (editorRef.current) setBody(editorRef.current.innerHTML);
  }, []);

  const processFile = useCallback((f: File) => {
    setCsvFile(f);
    const isExcel = f.name.endsWith('.xlsx') || f.name.endsWith('.xls');
    if (isExcel) {
      setEmails(['Parsed via Excel backend...']);
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      const matches = (ev.target?.result as string).match(EMAIL_REGEX) || [];
      setEmails(Array.from(new Set(matches.map(m => m.toLowerCase()))));
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
    if (attachmentFile)      fd.append('attachment',   attachmentFile);

    try {
      const res = await scheduleEmails(fd);
      const { count, skipped = 0, filtered = 0, invalidEmails = [], spamScore } = res.data;
      setSuccessInfo({ count, skipped, filtered, invalidEmails, spamScore });
      onSuccess();
      setTimeout(onClose, 4000);
    } catch (err: any) {
      setError(friendlyError(err, "Couldn't schedule this email. Please try again."));
    } finally {
      setTimeout(() => setLoading(false), 1000);
    }
  };

  const visibleEmails = emails.slice(0, 3);
  const remainingEmails = emails.length > 3 ? emails.length - 3 : 0;

  const setTomorrowAt = (hour?: number) => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(hour ?? 9, 0, 0, 0);
    const pad = (value: number) => String(value).padStart(2, '0');
    setStartTime(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl w-[1040px] flex flex-col relative" style={{ maxHeight: '95vh' }}>
        
        {/* Navigation Header */}
        <div className="h-[54px] px-6 border-b border-gray-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4 cursor-pointer" onClick={onClose}>
            <span className="text-gray-500 hover:text-gray-900 font-medium">← Compose New Email</span>
          </div>
          <div className="flex items-center gap-4">
            <button type="button" className="compose-icon-button" aria-label="Add attachment" onClick={() => document.getElementById('compose-attachment')?.click()}>
              <PaperclipIcon />
              {attachmentFile && <span className="attachment-count">1</span>}
               <input id="compose-attachment" type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={handleAttachmentChange} className="hidden" />
            </button>
            <button type="button" className="compose-icon-button" aria-label="Open send later picker" onClick={() => setShowSendLater(true)}><ClockIcon /></button>
            <button type="button" onClick={() => setShowSendLater(true)}
              className="border border-emerald-500 text-emerald-600 rounded-full px-4 py-1.5 font-medium hover:bg-emerald-50 transition">
              Send Later
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto flex flex-col">
          {error && <div className="px-6 py-2 bg-red-50 text-red-600 text-sm border-b border-red-100">{error}</div>}
          {successInfo && <div className="px-6 py-2 bg-green-50 text-green-600 text-sm border-b border-green-100">Successfully scheduled!</div>}

          {/* Form Inputs Container */}
          <div className="bg-white border-b border-gray-200 px-6 py-4 flex flex-col gap-3 shrink-0">
            {/* From */}
            <div className="flex items-center border-b border-gray-100 pb-3">
              <span className="w-16 text-gray-500 font-medium text-sm">From</span>
              <div className="bg-gray-100 rounded-md px-3 py-1 text-sm text-gray-700 font-medium select-none">
                {userEmail || 'me@domain.com'}
              </div>
            </div>

            {/* To */}
            <div className="flex items-center border-b border-gray-100 pb-3">
              <span className="w-16 text-gray-500 font-medium text-sm">To</span>
              <div className="flex-1 flex flex-wrap gap-2 items-center">
                {visibleEmails.map((em, i) => (
                  <span key={i} className="recipient-chip">{em}</span>
                ))}
                {remainingEmails > 0 && (
                  <span className="recipient-chip">+{remainingEmails}</span>
                )}
                <button type="button" onClick={() => fileInputRef.current?.click()} className="text-emerald-600 font-medium text-sm ml-2">
                  <UploadIcon /> Upload List
                </button>
                <input ref={fileInputRef} type="file" accept=".csv,.txt,.xlsx,.xls" onChange={handleFileChange} className="hidden" />
              </div>
            </div>

            {/* Subject */}
            <div className="flex items-center border-b border-gray-100 pb-3">
              <span className="w-16 text-gray-500 font-medium text-sm">Subject</span>
              <input type="text" value={subject} onChange={e => setSubject(e.target.value)} 
                className="flex-1 outline-none text-gray-900 placeholder-gray-400 text-sm" placeholder="Subject" />
            </div>

            {/* Throttling Inputs */}
            <div className="flex items-center gap-6 pt-1">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 font-medium text-sm">Delay between 2 emails</span>
                <input type="number" value={delayBetweenEmails} onChange={e => setDelay(e.target.value)}
                  className="w-16 outline-none border border-gray-200 rounded px-2 py-1 text-sm" placeholder="00" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 font-medium text-sm">Hourly Limit</span>
                <input type="number" value={hourlyLimit} onChange={e => setHourlyLimit(e.target.value)}
                  className="w-16 outline-none border border-gray-200 rounded px-2 py-1 text-sm" placeholder="00" />
              </div>
            </div>
          </div>

          {/* Text Editor Container */}
          <div className="p-6 flex-1 flex flex-col items-center">
            <div className="w-[1040px] h-[450px] bg-[#FAFAFA] border border-[#E5E7EB] rounded-[10px] p-4 flex flex-col gap-3 max-w-full relative shadow-inner">
              
              {/* Formatting Toolbar Pill at Top */}
              <div className="w-full h-[42px] rounded-full bg-white border border-gray-200 flex items-center px-4 justify-between shrink-0 shadow-sm overflow-x-auto">
                <div className="flex items-center gap-4 text-gray-600">
                  <div className="flex items-center gap-2">
                    <button type="button" aria-label="Undo" onMouseDown={event => event.preventDefault()} onClick={() => applyFormat('undo')} className="hover:bg-gray-100 p-1 rounded">↩</button>
                    <button type="button" aria-label="Redo" onMouseDown={event => event.preventDefault()} onClick={() => applyFormat('redo')} className="hover:bg-gray-100 p-1 rounded">↪</button>
                  </div>
                  <div className="w-px h-5 bg-gray-200"></div>
                  <button type="button" aria-label="Font size" onMouseDown={event => event.preventDefault()} onClick={() => applyFormat('fontSize', '3')} className="font-serif font-bold text-sm hover:bg-gray-100 p-1 rounded">TT ⌄</button>
                  <div className="w-px h-5 bg-gray-200"></div>
                  <div className="flex items-center gap-2 font-serif font-bold">
                    <button type="button" aria-label="Bold" onMouseDown={event => event.preventDefault()} onClick={() => applyFormat('bold')} className="hover:bg-gray-100 p-1 rounded">B</button>
                    <button type="button" aria-label="Italic" onMouseDown={event => event.preventDefault()} onClick={() => applyFormat('italic')} className="italic hover:bg-gray-100 p-1 rounded">I</button>
                    <button type="button" aria-label="Underline" onMouseDown={event => event.preventDefault()} onClick={() => applyFormat('underline')} className="underline hover:bg-gray-100 p-1 rounded">U</button>
                  </div>
                  <div className="w-px h-5 bg-gray-200"></div>
                  <button type="button" aria-label="Align left" onMouseDown={event => event.preventDefault()} onClick={() => applyFormat('justifyLeft')} className="hover:bg-gray-100 p-1 rounded"><AlignIcon /></button>
                  <div className="w-px h-5 bg-gray-200"></div>
                  <div className="flex items-center gap-2">
                    <button type="button" aria-label="Bulleted list" onMouseDown={event => event.preventDefault()} onClick={() => applyFormat('insertUnorderedList')} className="hover:bg-gray-100 p-1 rounded"><BulletListIcon /></button>
                    <button type="button" aria-label="Numbered list" onMouseDown={event => event.preventDefault()} onClick={() => applyFormat('insertOrderedList')} className="hover:bg-gray-100 p-1 rounded"><NumberedListIcon /></button>
                  </div>
                  <div className="w-px h-5 bg-gray-200"></div>
                  <div className="flex items-center gap-2">
                    <button type="button" aria-label="Decrease indent" onMouseDown={event => event.preventDefault()} onClick={() => applyFormat('outdent')} className="hover:bg-gray-100 p-1 rounded"><DecreaseIndentIcon /></button>
                    <button type="button" aria-label="Increase indent" onMouseDown={event => event.preventDefault()} onClick={() => applyFormat('indent')} className="hover:bg-gray-100 p-1 rounded"><IncreaseIndentIcon /></button>
                  </div>
                  <div className="w-px h-5 bg-gray-200"></div>
                  <div className="flex items-center gap-2">
                    <button type="button" aria-label="Blockquote" onMouseDown={event => event.preventDefault()} onClick={() => applyFormat('formatBlock', 'blockquote')} className="hover:bg-gray-100 p-1 rounded"><QuoteIcon /></button>
                    <button type="button" aria-label="Code block" onMouseDown={event => event.preventDefault()} onClick={() => applyFormat('formatBlock', 'pre')} className="hover:bg-gray-100 p-1 rounded"><BlockIcon /></button>
                  </div>
                  <div className="w-px h-5 bg-gray-200"></div>
                  <button type="button" aria-label="Strikethrough" onMouseDown={event => event.preventDefault()} onClick={() => applyFormat('strikeThrough')} className="hover:bg-gray-100 p-1 rounded"><StrikeIcon /></button>
                  <div className="w-px h-5 bg-gray-200"></div>
                  <button type="button" className="hover:bg-gray-100 p-1 rounded" aria-label="Add attachment" onClick={() => document.getElementById('compose-attachment')?.click()}><PaperclipIcon /></button>
                </div>
              </div>

              {/* ContentEditable Typing Area Below Toolbar */}
              <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                onInput={() => {
                  if (editorRef.current) setBody(editorRef.current.innerHTML);
                }}
                className="email-editor w-full flex-1 bg-transparent outline-none text-gray-800 text-sm overflow-y-auto pt-2 px-2"
                data-placeholder="Type your email content here..."
                role="textbox"
                aria-label="Email body"
              />
            </div>
          </div>
        </form>

        {/* Send Later Popover Modal */}
        {showSendLater && (
          <div className="absolute right-6 top-14 w-[320px] h-[366px] bg-white rounded-lg shadow-[0_2px_4px_-2px_rgba(0,0,0,0.1)] border border-[#E5E7EB] flex flex-col z-20">
            <div className="px-4 py-3 border-b border-gray-100 font-semibold text-gray-800">
              Send Later
            </div>
            <div className="p-4 flex-1 flex flex-col gap-4">
              <div className="relative">
                <input type="datetime-local" value={startTime} onChange={e => setStartTime(e.target.value)} 
                  className="w-full border border-gray-200 rounded px-3 py-2 text-sm outline-none text-gray-700" 
                  placeholder="Pick date & time" />
                {!startTime && <div className="absolute right-3 top-2.5 pointer-events-none"><CalendarIcon /></div>}
              </div>
              
              <div className="flex flex-col gap-2 flex-1">
                <button type="button" onClick={() => setTomorrowAt()} className="text-left text-sm text-gray-600 hover:bg-gray-50 px-3 py-2 rounded">Tomorrow</button>
                <button type="button" onClick={() => setTomorrowAt(10)} className="text-left text-sm text-gray-600 hover:bg-gray-50 px-3 py-2 rounded">Tomorrow, 10:00 AM</button>
                <button type="button" onClick={() => setTomorrowAt(11)} className="text-left text-sm text-gray-600 hover:bg-gray-50 px-3 py-2 rounded">Tomorrow, 11:00 AM</button>
                <button type="button" onClick={() => setTomorrowAt(15)} className="text-left text-sm text-gray-600 hover:bg-gray-50 px-3 py-2 rounded">Tomorrow, 3:00 PM</button>
              </div>
            </div>
            <div className="px-4 py-3 border-t border-gray-100 flex justify-end gap-3 items-center">
              <button type="button" onClick={() => setShowSendLater(false)} className="text-gray-500 hover:text-gray-700 text-sm font-medium">Cancel</button>
              <button type="button" onClick={(e) => { setShowSendLater(false); handleSubmit(e as any); }} className="border border-emerald-500 text-emerald-600 rounded-full px-4 py-1 text-sm font-medium hover:bg-emerald-50 transition">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function PaperclipIcon() {
  return <svg aria-hidden="true" className="compose-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m20.5 11.5-8.6 8.6a5 5 0 0 1-7.1-7.1l9.2-9.2a3.5 3.5 0 1 1 5 5l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" /></svg>;
}

function ClockIcon() {
  return <svg aria-hidden="true" className="compose-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
}

function CalendarIcon() {
  return <svg aria-hidden="true" className="calendar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M7 3.5v3M17 3.5v3M3.5 9h17" /></svg>;
}

function UploadIcon() {
  return <svg aria-hidden="true" className="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M8 8l4-4 4 4M5 14v5h14v-5" /></svg>;
}

function AlignIcon() {
  return <svg aria-hidden="true" className="toolbar-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 10h12M4 14h16M4 18h10" /></svg>;
}

function BulletListIcon() {
  return <svg aria-hidden="true" className="toolbar-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="5" cy="7" r="1" fill="currentColor"/><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="5" cy="17" r="1" fill="currentColor"/><path d="M10 7h10M10 12h10M10 17h10" /></svg>;
}

function NumberedListIcon() {
  return <svg aria-hidden="true" className="toolbar-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><path d="M10 7h10M10 12h10M10 17h10" /><path d="M4.5 6.5h1v3M4 9.5h2M4 14c0-1 2-1 2 0 0 .7-2 1.5-2 2.5h2" /></svg>;
}

function DecreaseIndentIcon() {
  return <svg aria-hidden="true" className="toolbar-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6h11M9 12h11M9 18h11M4 9l-3 3 3 3" /></svg>;
}

function IncreaseIndentIcon() {
  return <svg aria-hidden="true" className="toolbar-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6h11M9 12h11M9 18h11M4 9l3 3-3 3" /></svg>;
}

function QuoteIcon() {
  return <svg aria-hidden="true" className="toolbar-icon-svg" viewBox="0 0 24 24" fill="currentColor"><path d="M4 6h6v6H6v6H3v-6c0-3.3.3-4.5 1-6Zm10 0h6v6h-4v6h-3v-6c0-3.3.3-4.5 1-6Z" /></svg>;
}

function BlockIcon() {
  return <svg aria-hidden="true" className="toolbar-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M5 5h14v14H5zM8 9h8M8 12h8M8 15h5" /></svg>;
}

function StrikeIcon() {
  return <svg aria-hidden="true" className="toolbar-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M5 12h14M8 8c.3-2 2-3 4-3 2.4 0 4 1.2 4 3M16 16c-.3 2-2 3-4 3-2.4 0-4-1.2-4-3" /></svg>;
}
