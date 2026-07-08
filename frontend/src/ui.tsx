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
type CatStyle = { label: string; icon: string; tint: string; fg: string; bar: string };
const CAT = {
  food: { label: 'Food & Dining', icon: 'restaurant', tint: 'bg-secondary-container', fg: 'text-secondary', bar: 'bg-secondary' },
  coffee: { label: 'Coffee & Chai', icon: 'local_cafe', tint: 'bg-amber/10', fg: 'text-amber', bar: 'bg-amber' },
  groceries: { label: 'Groceries', icon: 'shopping_bag', tint: 'bg-sky/10', fg: 'text-sky', bar: 'bg-sky' },
  shopping: { label: 'Shopping', icon: 'shopping_bag', tint: 'bg-sky/10', fg: 'text-sky', bar: 'bg-sky' },
  entertainment: { label: 'Entertainment', icon: 'movie', tint: 'bg-plum/10', fg: 'text-plum', bar: 'bg-plum' },
  rent: { label: 'Rent & Home', icon: 'home', tint: 'bg-secondary-container', fg: 'text-secondary', bar: 'bg-secondary' },
  home: { label: 'Home', icon: 'home', tint: 'bg-secondary-container', fg: 'text-secondary', bar: 'bg-secondary' },
  utilities: { label: 'Utilities', icon: 'bolt', tint: 'bg-surface-container-high', fg: 'text-ink', bar: 'bg-neutral-600' },
  transport: { label: 'Transport', icon: 'directions_car', tint: 'bg-sky/10', fg: 'text-sky', bar: 'bg-sky' },
  travel: { label: 'Travel', icon: 'flight_takeoff', tint: 'bg-primary/10', fg: 'text-primary', bar: 'bg-primary' },
  settle: { label: 'Settlement', icon: 'handshake', tint: 'bg-teal/15', fg: 'text-tertiary', bar: 'bg-teal' },
} satisfies Record<string, CatStyle>;

// Pick a category style from a free-text description (best-effort keyword match).
export function categoryFor(text: string): CatStyle {
  const t = text.toLowerCase();
  if (/coffee|chai|cafe|starbucks|tea/.test(t)) return CAT.coffee;
  if (/rent|flat|apartment/.test(t)) return CAT.rent;
  if (/groc|dmart|super|vegetable|milk/.test(t)) return CAT.groceries;
  if (/movie|ticket|netflix|cinema|game/.test(t)) return CAT.entertainment;
  if (/electric|bill|water|gas|wifi|internet/.test(t)) return CAT.utilities;
  if (/auto|uber|ola|cab|taxi|petrol|fuel|bus|train|flight|trip|goa/.test(t)) return CAT.travel;
  if (/dinner|lunch|breakfast|food|restaurant|pizza|social|toit/.test(t)) return CAT.food;
  if (/settl/.test(t)) return CAT.settle;
  return CAT.food;
}

// Group-type → icon + swatch, for group cards.
export function groupTypeStyle(type: string): { icon: string; tint: string; fg: string } {
  switch (type) {
    case 'trip': return { icon: 'flight_takeoff', tint: 'bg-primary/10', fg: 'text-primary' };
    case 'home': return { icon: 'home', tint: 'bg-secondary-container', fg: 'text-secondary' };
    case 'couple': return { icon: 'favorite', tint: 'bg-primary/10', fg: 'text-primary' };
    default: return { icon: 'group', tint: 'bg-surface-container-high', fg: 'text-secondary' };
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
      {me ? 'You' : initial}
    </div>
  );
}
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// ── Invite card: create a placeholder user from a search query ─────────
// A phone-number query needs a real name (otherwise the person would surface
// as "Invited" everywhere, and keep that name when they later sign in).
const PHONE_RE = /^[+0-9\s-]{8,}$/;
export function InviteCard({ query, busy, onInvite }: { query: string; busy?: boolean; onInvite: (u: User) => void }) {
  const isPhone = PHONE_RE.test(query);
  const [inviteName, setInviteName] = useState('');
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function create() {
    if (creating || busy) return;
    const name = (isPhone ? inviteName : query).trim();
    if (!name) { setErr('Add their name so friends recognise them'); return; }
    setCreating(true); setErr(null);
    try {
      const u = await apiClient.createUser(isPhone ? { name, phone: query.trim() } : { name });
      onInvite(u);
      setInviteName('');
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Could not invite — try again');
    } finally { setCreating(false); }
  }

  return (
    <div className="border border-dashed border-neutral-300 rounded-card p-4 flex flex-col items-center gap-2 text-primary">
      <Icon name="person_add" style={{ fontSize: 24 }} />
      {isPhone ? (
        <>
          <p className="font-body text-[15px] font-medium text-ink text-center">Invite <span className="tnum">{query.trim()}</span></p>
          <input
            value={inviteName}
            onChange={(e) => setInviteName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && create()}
            className="input-warm text-center"
            placeholder="Their name"
            autoFocus
          />
        </>
      ) : (
        <p className="font-body text-[15px] font-medium text-center">Add "{query.trim()}" as a new person</p>
      )}
      {err && <p className="text-danger font-caption text-caption text-center">{err}</p>}
      <button
        onClick={create}
        disabled={creating || busy}
        className="px-6 h-10 rounded-button bg-primary text-on-primary font-body text-[15px] font-semibold active:scale-95 transition-transform disabled:opacity-60"
      >
        {creating ? 'Adding…' : 'Add'}
      </button>
      <p className="font-caption text-caption text-neutral-600 text-center">
        {isPhone ? "They'll see this group when they sign in with that number." : 'You can square up on their behalf until they join.'}
      </p>
    </div>
  );
}

// ── Bottom tab bar (mobile) ───────────────────────────────────────────
const TABS = [
  { to: '/', icon: 'home', label: 'Home', end: true },
  { to: '/groups', icon: 'group', label: 'Groups', end: false },
  { to: '/activity', icon: 'receipt_long', label: 'Activity', end: false },
  { to: '/profile', icon: 'person', label: 'Profile', end: false },
];
export function BottomNav() {
  return (
    <nav className="bg-surface-container-lowest/90 backdrop-blur-md border-t border-neutral-300 fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pt-2 safe-bottom rounded-t-2xl max-w-[28rem] mx-auto right-0">
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
