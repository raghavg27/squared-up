import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient, ApiError } from '../api.js';
import { Icon } from '../ui.js';
import { PageBanner } from '../banners.js';
import { useToast } from '../toast.js';

type Kind = 'issue' | 'feedback';

// Early-stage app: any bug report or product feedback is welcome. This screen
// only collects free text + a kind, POSTs to /feedback, and confirms success.
export function Feedback() {
  const nav = useNavigate();
  const { showToast } = useToast();
  const [kind, setKind] = useState<Kind>('feedback');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function submit() {
    if (busy) return;
    if (!message.trim()) { setErr('Please write something first'); return; }
    setBusy(true); setErr(null);
    try {
      await apiClient.submitFeedback(message.trim(), kind);
      setSent(true);
      showToast('Feedback submitted — thank you!');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not submit — try again');
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen pb-10 bg-paper">
        <PageBanner title="Feedback" />
        <main className="monzo-sheet mx-3 -mt-9 px-6 pb-10 flex flex-col items-center text-center">
          <span className="sheet-handle self-stretch" />
          <span className="w-20 h-20 rounded-full bg-surface shadow-soft flex items-center justify-center text-primary mt-10 pop-in">
            <Icon name="check_circle" fill style={{ fontSize: 52 }} />
          </span>
          <h1 className="font-heading text-[22px] font-extrabold text-ink mt-6">Feedback submitted</h1>
          <p className="font-body text-[15px] font-semibold text-neutral-600 mt-2 max-w-[42ch]">
            Thank you — your {kind === 'issue' ? 'report' : 'feedback'} has been received. It really helps us
            make Squared Up better.
          </p>
          <button
            onClick={() => nav('/profile', { replace: true })}
            className="w-full h-[54px] rounded-full bg-surface shadow-soft text-primary font-heading text-[17px] font-bold flex items-center justify-center mt-8 active:scale-[0.98] transition-transform"
          >
            Done
          </button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-10 bg-paper">
      <PageBanner title="Feedback" />
      <main className="monzo-sheet mx-3 -mt-9 px-6 pb-8 flex flex-col gap-5">
        <span className="sheet-handle" />
        <div className="pt-2" />
        <p className="font-body text-[15px] font-semibold text-neutral-600 leading-snug">
          Squared Up is early days. Hit a bug or have an idea? Tell us — every note is read and appreciated.
        </p>

        <div>
          <label className="font-caption text-caption text-on-surface-variant block mb-2">What is it?</label>
          <div className="flex gap-2">
            <KindPill label="Found an issue" icon="bug_report" active={kind === 'issue'} onClick={() => setKind('issue')} />
            <KindPill label="Feedback" icon="lightbulb" active={kind === 'feedback'} onClick={() => setKind('feedback')} />
          </div>
        </div>

        <div>
          <label className="font-caption text-caption text-on-surface-variant block mb-2">
            {kind === 'issue' ? 'Describe the issue' : 'Your feedback'}
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            maxLength={5000}
            className="input-warm shadow-soft resize-none"
            placeholder={kind === 'issue'
              ? 'What went wrong? What were you doing when it happened?'
              : 'What would make Squared Up better for you?'}
          />
        </div>

        {err && <p className="text-primary font-caption text-caption">{err}</p>}

        <button onClick={submit} disabled={busy} className="btn-coral mt-1">
          <span>{busy ? 'Sending…' : 'Submit'}</span>
          <Icon name="send" fill style={{ fontSize: 22 }} />
        </button>
      </main>
    </div>
  );
}

function KindPill({ label, icon, active, onClick }: { label: string; icon: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 h-[46px] rounded-full flex items-center justify-center gap-2 font-body text-[14px] font-bold transition-transform active:scale-[0.97] ${
        active ? 'bg-primary text-on-primary shadow-soft' : 'bg-surface-container text-neutral-600'
      }`}
    >
      <Icon name={icon} style={{ fontSize: 20 }} />
      {label}
    </button>
  );
}
