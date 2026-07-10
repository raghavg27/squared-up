// Self-contained charts for the Insights screen — no chart library, just SVG +
// flex so the PWA bundle stays lean. Colors come from the Warm Finance palette
// (index.css). Identity is never color-alone: every series/segment is labelled.
import { rupees, rupees0 } from './format.js';

// Fixed category → hue (assigned by identity, never cycled), one per canonical
// backend category (core/categories.py). Palette passes the dataviz validator
// on the light surface (lightness band, chroma floor, CVD ΔE ≥ 12); the three
// sub-3:1-contrast hues are covered because every segment/row is text-labelled
// with an icon and the donut keeps 4px surface gaps between segments.
const CAT_COLORS: Record<string, string> = {
  Food: '#b52330',
  Groceries: '#00a894',
  Transport: '#e8710a',
  Travel: '#5a9cff',
  Rent: '#4f4aa8',
  Utilities: '#cc8b00',
  Health: '#2e8b57',
  Entertainment: '#9068c8',
  Shopping: '#d264a8',
  Other: '#ab5a2b',
};
const CAT_ICONS: Record<string, string> = {
  Food: 'restaurant', Groceries: 'shopping_cart', Transport: 'directions_car',
  Travel: 'flight_takeoff', Rent: 'home', Utilities: 'bolt', Health: 'medical_services',
  Entertainment: 'movie', Shopping: 'shopping_bag', Other: 'category',
};
export const catColor = (name: string): string => CAT_COLORS[name] ?? '#ab5a2b';
export const catIcon = (name: string): string => CAT_ICONS[name] ?? 'category';

// ── Donut: spending share by category ─────────────────────────────────────────
export function CategoryDonut({ data, centerLabel, centerValue }: {
  data: { category: string; amount_paise: number }[];
  centerLabel: string; centerValue: number;
}) {
  const total = data.reduce((s, d) => s + d.amount_paise, 0);
  const R = 54, C = 2 * Math.PI * R, GAP = total > 0 ? 4 : 0;
  let offset = 0;
  const segs = data.filter((d) => d.amount_paise > 0);

  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 140 140" className="w-[132px] h-[132px] shrink-0 -rotate-90">
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--color-surface-container-high)" strokeWidth="18" />
        {segs.map((d) => {
          const len = (d.amount_paise / total) * C;
          const el = (
            <circle
              key={d.category} cx="70" cy="70" r={R} fill="none"
              stroke={catColor(d.category)} strokeWidth="18" strokeLinecap="round"
              strokeDasharray={`${Math.max(len - GAP, 0.001)} ${C - Math.max(len - GAP, 0.001)}`}
              strokeDashoffset={-offset}
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="min-w-0">
        <p className="font-caption text-caption text-secondary">{centerLabel}</p>
        <p className="font-heading text-[26px] font-bold text-ink tnum leading-tight">{rupees0(centerValue)}</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {segs.slice(0, 5).map((d) => (
            <li key={d.category} className="flex items-center gap-2 text-[13px]">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: catColor(d.category) }} />
              <span className="text-ink truncate flex-1">{d.category}</span>
              <span className="text-secondary tnum">{Math.round((d.amount_paise / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ── Monthly columns: single-series spend trend (no legend needed) ─────────────
export function MonthlyBars({ data }: { data: { label: string; amount_paise: number; month: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.amount_paise));
  return (
    <div className="flex items-end justify-between gap-1.5 h-40 pt-6">
      {data.map((d) => {
        const pct = (d.amount_paise / max) * 100;
        return (
          <div key={d.month} className="flex-1 flex flex-col items-center justify-end h-full min-w-0">
            <span className="font-caption text-[9px] text-secondary tnum mb-1 truncate w-full text-center">
              {d.amount_paise > 0 ? rupees0(d.amount_paise) : ''}
            </span>
            <div
              className="w-full max-w-[26px] rounded-t-[4px] bg-primary transition-[height] duration-500"
              style={{ height: `${Math.max(pct, d.amount_paise > 0 ? 4 : 0)}%` }}
              title={`${d.label}: ${rupees(d.amount_paise)}`}
            />
            <span className="font-caption text-[11px] text-secondary mt-1.5">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Horizontal bars: spend by group (labelled rows, single accent) ────────────
export function GroupBars({ data }: { data: { name: string; amount_paise: number; group_id: number | null }[] }) {
  const max = Math.max(1, ...data.map((d) => d.amount_paise));
  return (
    <ul className="flex flex-col gap-3">
      {data.map((d) => (
        <li key={d.group_id ?? 'personal'} className="min-w-0">
          <div className="flex items-baseline justify-between mb-1">
            <span className="font-body text-[14px] text-ink truncate pr-2">{d.name}</span>
            <span className="font-currency text-[13px] text-secondary tnum shrink-0">{rupees0(d.amount_paise)}</span>
          </div>
          <div className="h-2.5 rounded-full bg-surface-container-high overflow-hidden">
            <div
              className="h-full rounded-full bg-tertiary-container transition-[width] duration-500"
              style={{ width: `${Math.max((d.amount_paise / max) * 100, d.amount_paise > 0 ? 3 : 0)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Stat tile: a single headline number ───────────────────────────────────────
export function StatTile({ label, value, sub, tone = 'ink' }: {
  label: string; value: string; sub?: string; tone?: 'ink' | 'success' | 'danger';
}) {
  const color = tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-ink';
  return (
    <div className="bg-surface-container-lowest rounded-card border border-neutral-300 card-shadow px-4 py-3">
      <p className="font-caption text-caption text-secondary">{label}</p>
      <p className={`font-heading text-[20px] font-bold tnum mt-0.5 ${color}`}>{value}</p>
      {sub && <p className="font-caption text-[11px] text-secondary mt-0.5">{sub}</p>}
    </div>
  );
}
