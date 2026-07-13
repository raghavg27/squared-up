import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient, ApiError } from '../api.js';
import { useStore } from '../store.js';
import { Avatar } from '../ui.js';
import { PageBanner } from '../banners.js';

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
      <PageBanner
        title="Edit Profile"
        action={
          <button onClick={save} disabled={busy} className="px-3 h-10 font-body text-[15px] text-white font-bold disabled:opacity-60 active:scale-95 transition-transform">
            {busy ? '…' : 'Save'}
          </button>
        }
      />

      <main className="monzo-sheet mx-3 -mt-9 px-6 pb-8 flex flex-col gap-5">
        <span className="sheet-handle" />
        <div className="pt-2" />
        <div className="flex justify-center">
          <Avatar name={name || me?.name || '?'} size={96} />
        </div>

        <div>
          <label className="font-caption text-caption text-on-surface-variant block mb-2">Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input-warm shadow-soft" placeholder="Your name" />
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
