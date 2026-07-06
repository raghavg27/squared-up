import { NavLink } from 'react-router-dom';

// ── Material Symbols icon ─────────────────────────────────────────────
export function Icon({ name, fill, className, style }: { name: string; fill?: boolean; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`material-symbols-outlined${fill ? ' fill' : ''}${className ? ' ' + className : ''}`} style={style}>
      {name}
    </span>
  );
}

// ── Category → icon + tinted swatch (Warm Finance lifestyle icons) ─────
type CatStyle = { icon: string; tint: string; fg: string };
const CAT = {
  food: { icon: 'restaurant', tint: 'bg-secondary-container', fg: 'text-secondary' },
  coffee: { icon: 'local_cafe', tint: 'bg-amber/10', fg: 'text-amber' },
  groceries: { icon: 'shopping_bag', tint: 'bg-sky/10', fg: 'text-sky' },
  shopping: { icon: 'shopping_bag', tint: 'bg-sky/10', fg: 'text-sky' },
  entertainment: { icon: 'movie', tint: 'bg-plum/10', fg: 'text-plum' },
  rent: { icon: 'home', tint: 'bg-secondary-container', fg: 'text-secondary' },
  home: { icon: 'home', tint: 'bg-secondary-container', fg: 'text-secondary' },
  utilities: { icon: 'bolt', tint: 'bg-surface-container-high', fg: 'text-ink' },
  transport: { icon: 'directions_car', tint: 'bg-sky/10', fg: 'text-sky' },
  travel: { icon: 'flight_takeoff', tint: 'bg-primary/10', fg: 'text-primary' },
  settle: { icon: 'handshake', tint: 'bg-teal/15', fg: 'text-tertiary' },
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
  const initial = (name || '?').trim().charAt(0).toUpperCase();
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

// ── Bottom tab bar (mobile) ───────────────────────────────────────────
const TABS = [
  { to: '/', icon: 'home', label: 'Home', end: true },
  { to: '/groups', icon: 'group', label: 'Groups', end: false },
  { to: '/activity', icon: 'receipt_long', label: 'Activity', end: false },
  { to: '/profile', icon: 'person', label: 'Profile', end: false },
];
export function BottomNav() {
  return (
    <nav className="bg-surface-container-lowest border-t border-neutral-300 fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 py-2 rounded-t-2xl max-w-[28rem] mx-auto right-0">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className="flex flex-col items-center justify-center w-16 h-12 active:scale-90 transition-transform duration-150"
        >
          {({ isActive }) => (
            <>
              <Icon
                name={t.icon}
                fill={isActive}
                className={isActive ? 'text-primary' : 'text-secondary'}
              />
              <span className={`text-[11px] leading-4 mt-0.5 ${isActive ? 'text-primary font-bold' : 'text-secondary'}`}>{t.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
