import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import { apiClient, ApiError, type User } from './api.js';

// ── Count-up: makes hero money numbers land with a satisfying roll ─────
export function useCountUp(target: number, ms = 600): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; fromRef.current = target; setValue(target); return; }
    const from = fromRef.current;
    if (from === target) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      fromRef.current = target; setValue(target); return;
    }
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return value;
}

// ── Material Symbols icon ─────────────────────────────────────────────
export function Icon({ name, fill, className, style }: { name: string; fill?: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`material-symbols-outlined${fill ? ' fill' : ''}${className ? ' ' + className : ''}`} style={style}>
      {name}
    </span>
  );
}

// ── Category → icon + tinted swatch (Warm Finance lifestyle icons) ─────
// Keys are the canonical backend labels (core/categories.py CATEGORIES),
// plus 'Settlement' which only exists as a display style.
export type CatStyle = { label: string; icon: string; tint: string; fg: string; bar: string };
const CAT: Record<string, CatStyle> = {
  Food: { label: 'Food & Dining', icon: 'restaurant', tint: 'bg-secondary-container', fg: 'text-secondary', bar: 'bg-secondary' },
  Groceries: { label: 'Groceries', icon: 'shopping_cart', tint: 'bg-sky/10', fg: 'text-sky', bar: 'bg-sky' },
  Transport: { label: 'Transport', icon: 'directions_car', tint: 'bg-sky/10', fg: 'text-sky', bar: 'bg-sky' },
  Travel: { label: 'Travel', icon: 'flight_takeoff', tint: 'bg-primary/10', fg: 'text-primary', bar: 'bg-primary' },
  Rent: { label: 'Rent & Home', icon: 'home', tint: 'bg-secondary-container', fg: 'text-secondary', bar: 'bg-secondary' },
  Utilities: { label: 'Utilities', icon: 'bolt', tint: 'bg-surface-container-high', fg: 'text-ink', bar: 'bg-neutral-600' },
  Health: { label: 'Health', icon: 'medical_services', tint: 'bg-teal/15', fg: 'text-tertiary', bar: 'bg-teal' },
  Entertainment: { label: 'Entertainment', icon: 'movie', tint: 'bg-plum/10', fg: 'text-plum', bar: 'bg-plum' },
  Shopping: { label: 'Shopping', icon: 'shopping_bag', tint: 'bg-amber/10', fg: 'text-amber', bar: 'bg-amber' },
  Other: { label: 'Other', icon: 'category', tint: 'bg-surface-container-high', fg: 'text-secondary', bar: 'bg-neutral-600' },
  Settlement: { label: 'Settlement', icon: 'handshake', tint: 'bg-teal/15', fg: 'text-tertiary', bar: 'bg-teal' },
};

// Guess a canonical category from free text — a trimmed mirror of the backend
// rules (core/categories.py). Display-side fallback only; the server label wins.
export function guessCategory(text: string): string {
  const t = text.toLowerCase();
  if (/settl/.test(t)) return 'Settlement';
  if (/dinner|lunch|breakfast|food|restaurant|pizza|burger|biryani|chai|coffee|cafe|tea|swiggy|zomato|dhaba|toit/.test(t)) return 'Food';
  if (/groc|sabzi|vegetable|fruit|kirana|dmart|bigbasket|blinkit|zepto|milk/.test(t)) return 'Groceries';
  if (/auto|uber|ola|cab|taxi|metro|bus|rickshaw|rapido|petrol|diesel|fuel|parking|toll/.test(t)) return 'Transport';
  if (/flight|train|hotel|hostel|airbnb|oyo|trip|travel|vacation|holiday|goa/.test(t)) return 'Travel';
  if (/rent|kiraya|flat|apartment|maintenance|deposit/.test(t)) return 'Rent';
  if (/electric|water|wifi|internet|broadband|gas|bill|recharge|dth/.test(t)) return 'Utilities';
  if (/medicin|medical|pharma|chemist|doctor|hospital|clinic|dentist|gym/.test(t)) return 'Health';
  if (/movie|cinema|netflix|hotstar|spotify|bookmyshow|game|concert|party|ipl/.test(t)) return 'Entertainment';
  if (/shop|amazon|flipkart|myntra|mall|clothes|shoes|laptop|phone|mobile|electronics|furniture|gift/.test(t)) return 'Shopping';
  return 'Other';
}

// Style for an expense: the stored server label when present (the user may have
// corrected it), keyword guess from the description otherwise. Never defaults
// to Food — an unknown expense is honestly 'Other'.
export function categoryStyle(label: string | null | undefined, description = ''): CatStyle {
  return (label && CAT[label]) || CAT[guessCategory(description)] || CAT.Other!;
}

// Legacy alias for description-only call sites (settlement rows etc.).
export function categoryFor(text: string): CatStyle {
  return categoryStyle(undefined, text);
}

// Group-type → icon + swatch, for group cards. Anything outside the standard
// set is a user-defined custom type (free text) and gets the label icon.
export function groupTypeStyle(type: string): { icon: string; tint: string; fg: string } {
  switch (type) {
    case 'trip': return { icon: 'flight_takeoff', tint: 'bg-primary/10', fg: 'text-primary' };
    case 'home': return { icon: 'home', tint: 'bg-secondary-container', fg: 'text-secondary' };
    case 'couple': return { icon: 'favorite', tint: 'bg-primary/10', fg: 'text-primary' };
    case 'personal': return { icon: 'person', tint: 'bg-teal/15', fg: 'text-tertiary' };
    case 'other': return { icon: 'group', tint: 'bg-surface-container-high', fg: 'text-secondary' };
    default: return { icon: 'label', tint: 'bg-surface-container-high', fg: 'text-secondary' };
  }
}

// ── Avatar: initial-based (no external images to keep offline-safe) ────
const AV_COLORS = ['bg-secondary-container text-secondary', 'bg-primary/10 text-primary', 'bg-teal/15 text-tertiary', 'bg-sky/15 text-sky', 'bg-amber/15 text-amber', 'bg-plum/15 text-plum'];
export function Avatar({ name, size = 40, me }: { name: string; size?: number; me?: boolean }) {
  // One word → single initial ("Raghav" → "R"); multi-word → first letter of
  // first two words ("Raghav Gupta" → "RG").
  const words = (name || '?').trim().split(/\s+/).filter(Boolean);
  const initial = (words.length > 1
    ? (words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')
    : (words[0]?.[0] ?? '?')).toUpperCase();
  const color = me ? 'bg-primary text-on-primary' : AV_COLORS[hash(name) % AV_COLORS.length];
  return (
    <div
      className={`rounded-full flex items-center justify-center font-heading font-semibold shrink-0 ${color}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </div>
  );
}
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ── Invite card: create a placeholder user from a search query ─────────
// A phone/email query needs a real name (otherwise the person would surface as
// their raw number/address everywhere, and keep it as a name when they later
// sign in). Email is a login identity too, so it goes in `email`, never `name`.
// `onInviteLink`, when provided, adds a second action that also opens the share
// sheet with a join deep-link (see invite.ts).
const PHONE_RE = /^[+0-9\s-]{8,}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export function InviteCard({ query, busy, onInvite, onInviteLink }: {
  query: string; busy?: boolean;
  onInvite: (u: User) => void;
  onInviteLink?: (u: User) => void | Promise<void>;
}) {
  const isEmail = EMAIL_RE.test(query.trim());
  const isPhone = !isEmail && PHONE_RE.test(query);
  const needsName = isPhone || isEmail;
  const [inviteName, setInviteName] = useState('');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create(then: (u: User) => void | Promise<void>) {
    if (creating || busy) return;
    const name = (needsName ? inviteName : query).trim();
    if (!name) { setErr('Add their name so friends recognise them'); return; }
    setCreating(true); setErr(null);
    try {
      const q = query.trim();
      const u = await apiClient.createUser(isPhone ? { name, phone: q } : isEmail ? { name, email: q } : { name });
      await then(u);
      setInviteName('');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not invite — try again');
    } finally { setCreating(false); }
  }

  return (
    <div className="border border-dashed border-neutral-300 rounded-card p-4 flex flex-col items-center gap-2 text-primary">
      <Icon name="person_add" style={{ fontSize: 24 }} />
      {needsName ? (
        <>
          <p className="font-body text-[15px] font-medium text-ink text-center">Invite <span className="tnum">{query.trim()}</span></p>
          {/* No autoFocus: this card can appear mid-typing (a partial phone
              number already looks phone-like) and must not steal the caret
              from the search box. */}
          <input
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create(onInvite)}
            className="input-warm text-center"
            placeholder="Their name"
          />
        </>
      ) : (
        <p className="font-body text-[15px] font-medium text-center">Add "{query.trim()}" as a new person</p>
      )}
      {err && <p className="text-danger font-caption text-caption text-center">{err}</p>}
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          onClick={() => create(onInvite)}
          disabled={creating || busy}
          className="px-6 h-10 rounded-button bg-primary text-on-primary font-body text-[15px] font-semibold active:scale-95 transition-transform disabled:opacity-60"
        >
          {creating ? 'Adding…' : 'Add'}
        </button>
        {onInviteLink && (
          <button
            onClick={() => create(onInviteLink)}
            disabled={creating || busy}
            className="px-5 h-10 rounded-button border border-primary text-primary font-body text-[15px] font-semibold flex items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60"
          >
            <Icon name="share" style={{ fontSize: 18 }} />Invite via link
          </button>
        )}
      </div>
      <p className="font-caption text-caption text-neutral-600 text-center">
        {needsName
          ? "They'll join this person when they sign in with that " + (isPhone ? 'number' : 'email') + ', keeping your shared history.'
          : 'You can square up on their behalf until they join.'}
      </p>
    </div>
  );
}

// ── Bottom tab bar (mobile) ───────────────────────────────────────────
// (The top banners — CoralBanner for tab roots, PageBanner for sub-screens —
// live in banners.tsx.)
const TABS = [
  { to: '/', icon: 'home', label: 'Home', end: true },
  { to: '/groups', icon: 'group', label: 'Groups', end: false },
  { to: '/insights', icon: 'monitoring', label: 'Insights', end: false },
  { to: '/activity', icon: 'receipt_long', label: 'Activity', end: false },
  { to: '/profile', icon: 'person', label: 'Profile', end: false },
];
export function BottomNav() {
  return (
    <nav className="bg-surface/95 backdrop-blur-md fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pt-2 safe-bottom rounded-t-[28px] max-w-[28rem] mx-auto right-0 [box-shadow:0_-10px_30px_rgba(20,33,60,0.10)]">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className="flex flex-col items-center justify-center w-16 h-12 active:scale-90 transition-transform duration-150"
        >
          {({ isActive }) => (
            <>
              <span className={`flex items-center justify-center h-7 w-12 rounded-full transition-colors duration-200 ${isActive ? 'bg-primary/10' : ''}`}>
                <Icon
                  name={t.icon}
                  fill={isActive}
                  className={`transition-colors duration-200 ${isActive ? 'text-primary' : 'text-secondary'}`}
                  style={{ fontSize: 22 }}
                />
              </span>
              <span className={`text-[11px] leading-4 mt-0.5 transition-colors duration-200 ${isActive ? 'text-primary font-bold' : 'text-secondary'}`}>{t.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
