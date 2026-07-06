import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../ui.js';
import { apiClient, ApiError } from '../api.js';
import { useStore } from '../store.js';

export function Onboarding() {
  const nav = useNavigate();
  const { me, refreshMe } = useStore();
  const [name, setName] = useState(me?.name ?? '');
  const [vpa, setVpa] = useState(me?.upi_vpa ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function finish() {
    if (busy) return;
    if (!name.trim()) { setErr('Please enter your name'); return; }
    if (vpa && !/^[\w.\-]+@[\w.\-]+$/.test(vpa.trim())) { setErr('That UPI ID looks off (e.g. name@okhdfc)'); return; }
    setBusy(true); setErr(null);
    try {
      await apiClient.updateMe({ name: name.trim(), upi_vpa: vpa.trim() || null });
      await refreshMe();
      nav('/', { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not save — try again');
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col px-mobile bg-paper">
      <div className="flex-1 flex flex-col justify-center">
        <div className="w-16 h-16 rounded-card bg-primary/10 text-primary flex items-center justify-center">
          <Icon name="waving_hand" fill style={{ fontSize: 30 }} />
        </div>
        <h1 className="font-heading text-[32px] font-bold text-ink mt-5">Welcome!</h1>
        <p className="font-body text-[17px] text-on-surface-variant mt-2">Let's set up your profile so friends can find and pay you.</p>

        <div className="mt-8">
          <label className="font-caption text-caption text-on-surface-variant block mb-2">Your name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="input-warm" placeholder="e.g. Priya Sharma" />
        </div>

        <div className="mt-5">
          <label className="font-caption text-caption text-on-surface-variant block mb-2">UPI ID <span className="text-neutral-600">(optional)</span></label>
          <input value={vpa} onChange={(e) => setVpa(e.target.value)} className="input-warm font-currency" placeholder="priya@okhdfc" />
          <p className="font-caption text-caption text-neutral-600 mt-2">So friends can settle up with you in one tap.</p>
        </div>

        {err && <p className="text-primary font-caption text-caption mt-4">{err}</p>}
      </div>

      <div className="pb-8">
        <button
          onClick={finish}
          disabled={busy}
          className="w-full h-[56px] bg-primary text-on-primary rounded-button font-heading text-[17px] font-bold active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {busy ? 'Saving…' : "Let's go"}
        </button>
      </div>
    </div>
  );
}
