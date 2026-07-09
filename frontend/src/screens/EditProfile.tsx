import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient, ApiError } from '../api.js';
import { useStore } from '../store.js';
import { Avatar, Icon } from '../ui.js';

export function EditProfile() {
  const nav = useNavigate();
  const { me, refreshMe } = useStore();
  const [name, setName] = useState(me?.name ?? '');
  const [email, setEmail] = useState(me?.email ?? '');
  const [vpa, setVpa] = useState(me?.upi_vpa ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Email proven via Google is the source of truth — read-only, like phone.
  const emailLocked = !!me?.email_verified;

  async function save() {
    if (busy) return;
    if (!name.trim()) { setErr('Name is required'); return; }
    if (email.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) { setErr('That email doesn’t look right'); return; }
    if (vpa && !/^[\w.\-]+@[\w.\-]+$/.test(vpa.trim())) { setErr('That UPI ID looks off (e.g. name@okhdfc)'); return; }
    setBusy(true); setErr(null);
    try {
      await apiClient.updateMe({
        name: name.trim(),
        upi_vpa: vpa.trim() || null,
        locale: 'en',
        ...(emailLocked ? {} : { email: email.trim() || null }),
      });
      await refreshMe();
      nav('/profile', { replace: true });
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not save'); setBusy(false); }
  }

  return (
    <div className="min-h-screen pb-10 bg-paper">
      <header className="flex items-center justify-between px-mobile py-3 border-b border-neutral-100">
        <button onClick={() => nav(-1)} className="w-10 h-10 flex items-center justify-center text-ink active:scale-95 transition-transform">
          <Icon name="close" />
        </button>
        <h1 className="font-heading text-[22px] font-bold text-ink">Edit Profile</h1>
        <button onClick={save} disabled={busy} className="font-body text-[15px] text-primary font-bold disabled:opacity-60">{busy ? '…' : 'Save'}</button>
      </header>

      <main className="px-mobile flex flex-col gap-5 mt-6">
        <div className="flex justify-center">
          <Avatar name={name || me?.name || '?'} size={96} />
        </div>

        <div>
          <label className="font-caption text-caption text-on-surface-variant block mb-2">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input-warm" placeholder="Your name" />
        </div>
        <div>
          <label className="font-caption text-caption text-on-surface-variant block mb-2">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={emailLocked}
            type="email"
            autoComplete="email"
            className={`input-warm${emailLocked ? ' opacity-70' : ''}`}
            placeholder="you@gmail.com"
          />
          {emailLocked && <p className="font-caption text-caption text-neutral-600 mt-1">Verified with Google — can't be changed.</p>}
        </div>
        <div>
          <label className="font-caption text-caption text-on-surface-variant block mb-2">UPI ID</label>
          <input value={vpa} onChange={(e) => setVpa(e.target.value)} className="input-warm font-currency" placeholder="name@okhdfc" />
        </div>
        <div>
          <label className="font-caption text-caption text-on-surface-variant block mb-2">Phone</label>
          <input value={me?.phone ?? ''} disabled className="input-warm opacity-70 tnum" />
          <p className="font-caption text-caption text-neutral-600 mt-1">Phone number can't be changed.</p>
        </div>
        {err && <p className="text-primary font-caption text-caption">{err}</p>}
      </main>
    </div>
  );
}
