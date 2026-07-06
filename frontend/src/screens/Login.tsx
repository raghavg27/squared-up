import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../ui.js';
import { Logo } from './Loading.js';
import { apiClient, ApiError } from '../api.js';

export function Login() {
  const nav = useNavigate();
  const [step, setStep] = useState<'intro' | 'phone'>('intro');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function sendOtp() {
    if (busy) return;
    const digits = phone.replace(/[^0-9]/g, '');
    if (digits.length < 10) { setErr('Enter a valid mobile number'); return; }
    setBusy(true); setErr(null);
    try {
      const r = await apiClient.requestOtp(phone);
      nav('/otp', { state: { phone: r.phone, devCode: r.dev_code } });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "That didn't go through — try again");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col px-mobile bg-paper">
      <div className="flex-1 flex flex-col items-center justify-center">
        <Logo />
        <h1 className="font-heading text-[34px] leading-tight font-bold text-ink mt-6">Squared Up</h1>
        <p className="font-body text-[17px] text-on-surface-variant text-center mt-3 max-w-[300px]">
          Split bills with friends, settle up in one tap via UPI.
        </p>

        {step === 'intro' ? (
          <>
            <button
              onClick={() => setStep('phone')}
              className="w-full max-w-[28rem] bg-primary text-on-primary h-[52px] rounded-button font-heading text-[17px] font-bold flex items-center justify-center gap-2 mt-10 active:scale-[0.98] transition-transform"
            >
              <Icon name="smartphone" style={{ fontSize: 22 }} />
              Continue with Mobile Number
            </button>

            <div className="w-full max-w-[28rem] flex items-center gap-3 my-6">
              <div className="h-px flex-1 bg-neutral-300" />
              <span className="font-caption text-caption text-neutral-600">OR</span>
              <div className="h-px flex-1 bg-neutral-300" />
            </div>

            <div className="w-full max-w-[28rem] grid grid-cols-2 gap-4">
              <button onClick={() => setStep('phone')} className="h-[52px] rounded-button border border-neutral-300 bg-surface-container-lowest flex items-center justify-center gap-2 font-body text-[15px] font-medium text-ink active:scale-[0.98] transition-transform">
                <GoogleG /> Google
              </button>
              <button onClick={() => setStep('phone')} className="h-[52px] rounded-button border border-neutral-300 bg-surface-container-lowest flex items-center justify-center gap-2 font-body text-[15px] font-medium text-ink active:scale-[0.98] transition-transform">
                <AppleLogo /> Apple
              </button>
            </div>
          </>
        ) : (
          <div className="w-full max-w-[28rem] mt-10">
            <label className="font-caption text-caption text-on-surface-variant block mb-2">Mobile number</label>
            <div className="flex items-center gap-2 bg-neutral-100 rounded-button px-4 h-[52px] focus-within:outline focus-within:outline-2 focus-within:outline-primary">
              <span className="font-body text-[17px] text-neutral-600">+91</span>
              <input
                autoFocus
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                onKeyDown={(e) => e.key === 'Enter' && sendOtp()}
                inputMode="numeric"
                maxLength={10}
                placeholder="98765 43210"
                className="flex-1 bg-transparent outline-none font-body text-[17px] text-ink tnum"
              />
            </div>
            {err && <p className="text-primary font-caption text-caption mt-2">{err}</p>}
            <button
              onClick={sendOtp}
              disabled={busy}
              className="w-full bg-primary text-on-primary h-[52px] rounded-button font-heading text-[17px] font-bold mt-4 active:scale-[0.98] transition-transform disabled:opacity-60"
            >
              {busy ? 'Sending…' : 'Send code'}
            </button>
            <button onClick={() => { setStep('intro'); setErr(null); }} className="w-full text-center font-body text-[15px] text-neutral-600 mt-4">
              Back
            </button>
          </div>
        )}
      </div>

      <div className="pb-8 flex justify-center">
        <span className="bg-surface-container text-neutral-600 font-caption text-caption px-4 py-1.5 rounded-full">
          Made for India 🇮🇳
        </span>
      </div>
    </div>
  );
}

function AppleLogo() {
  return (
    <svg width="16" height="18" viewBox="0 0 24 24" fill="#1a1c1b" aria-hidden>
      <path d="M17.05 12.04c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.1-2.01-3.77-2.04-1.6-.16-3.13.94-3.94.94-.81 0-2.07-.92-3.4-.9-1.75.03-3.36 1.02-4.26 2.58-1.82 3.15-.46 7.8 1.3 10.35.86 1.25 1.88 2.65 3.22 2.6 1.29-.05 1.78-.83 3.34-.83 1.55 0 2 .83 3.37.81 1.39-.03 2.27-1.27 3.12-2.53.98-1.45 1.38-2.86 1.4-2.93-.03-.01-2.69-1.03-2.72-4.07M14.53 4.42c.71-.86 1.19-2.06 1.06-3.25-1.02.04-2.26.68-2.99 1.54-.66.76-1.23 1.98-1.08 3.15 1.14.09 2.3-.58 3.01-1.44" />
    </svg>
  );
}

function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}
