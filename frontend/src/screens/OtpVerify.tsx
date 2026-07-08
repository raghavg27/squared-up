import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Icon } from '../ui.js';
import { Logo } from './Loading.js';
import { apiClient, ApiError } from '../api.js';
import { useStore } from '../store.js';

const LEN = 6;

export function OtpVerify() {
  const nav = useNavigate();
  const loc = useLocation();
  const { loginWith } = useStore();
  const state = (loc.state as { phone?: string; devCode?: string } | null) ?? {};
  const phone = state.phone;
  const [digits, setDigits] = useState<string[]>(Array(LEN).fill(''));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(30);
  const inputs = useRef<(HTMLInputElement | null)[]>([]);

  // No phone in nav state (e.g. hard refresh) → back to login.
  useEffect(() => { if (!phone) nav('/login', { replace: true }); }, [phone, nav]);

  // Dev convenience: prefill the code returned by the API in DEBUG.
  useEffect(() => {
    if (state.devCode && state.devCode.length === LEN) {
      setDigits(state.devCode.split(''));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  function setAt(i: number, v: string) {
    const c = v.replace(/[^0-9]/g, '').slice(-1);
    setDigits((d) => { const n = [...d]; n[i] = c; return n; });
    if (c && i < LEN - 1) inputs.current[i + 1]?.focus();
  }

  function onKey(i: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
    if (e.key === 'Enter') verify();
  }

  function onPaste(e: React.ClipboardEvent) {
    const txt = e.clipboardData.getData('text').replace(/[^0-9]/g, '').slice(0, LEN);
    if (txt) { e.preventDefault(); setDigits(txt.padEnd(LEN, '').split('').slice(0, LEN)); }
  }

  async function verify() {
    const code = digits.join('');
    if (code.length !== LEN || !phone) { setErr('Enter the 6-digit code'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await apiClient.verifyOtp(phone, code);
      loginWith(r); // store flips to onboarding or ready; router redirects
      nav(r.is_new || !r.user.name?.trim() ? '/onboarding' : '/', { replace: true });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not verify — try again');
      setBusy(false);
    }
  }

  async function resend() {
    if (cooldown > 0 || !phone) return;
    try { await apiClient.requestOtp(phone); setCooldown(30); setErr(null); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not resend'); }
  }

  return (
    <div className="min-h-screen flex flex-col px-mobile bg-paper">
      <header className="py-3">
        <button onClick={() => nav('/login')} className="w-10 h-10 flex items-center justify-center text-ink active:scale-95 transition-transform">
          <Icon name="arrow_back" />
        </button>
      </header>

      <div className="flex-1 flex flex-col items-center">
        <div className="mt-10"><Logo size={72} /></div>
        <h1 className="font-heading text-[28px] font-bold text-ink mt-5">Verify your number</h1>
        <p className="font-body text-[15px] text-on-surface-variant text-center mt-2">
          Enter the code sent to <span className="text-ink font-medium tnum">{phone}</span>
        </p>

        <div className="flex gap-2 mt-8" onPaste={onPaste}>
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => { inputs.current[i] = el; }}
              value={d}
              onChange={(e) => setAt(i, e.target.value)}
              onKeyDown={(e) => onKey(i, e)}
              inputMode="numeric"
              maxLength={1}
              className="w-12 h-14 text-center font-heading text-[24px] font-bold text-ink bg-neutral-100 rounded-button outline-none focus:outline-2 focus:outline-primary tnum"
            />
          ))}
        </div>
        {err && <p className="text-primary font-caption text-caption mt-3">{err}</p>}

        <button
          onClick={verify}
          disabled={busy}
          className="w-full max-w-[28rem] bg-primary text-on-primary h-[52px] rounded-button font-heading text-[17px] font-bold mt-8 active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {busy ? 'Verifying…' : 'Verify'}
        </button>

        <button onClick={resend} disabled={cooldown > 0} className="mt-5 font-body text-[15px] text-primary font-medium disabled:text-neutral-600">
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
      </div>
    </div>
  );
}
