import { Icon } from '../ui.js';
import { rupees0 } from '../format.js';
import './home-concept.css';

// A throwaway visual sample: Squared Up's home content rendered in the Monzo
// "Balance" concept (monzo-concept-ui). Static mock data only — this screen is
// not wired to the store or api, it exists purely to preview the look. The real
// Home lives in Home.tsx and is untouched.

// ── Mock: overall standing, as signed paise ───────────────────────────
const OWED_PAISE = 434000; // others owe you
const OWE_PAISE = 110000; // you owe others
const SETTLED_PAISE = 256000; // squared-up / neutral, for the ring only
const NET_PAISE = OWED_PAISE - OWE_PAISE;

// Ring segments, drawn clockwise from 12 o'clock in this order.
const SEGMENTS = [
  { paise: OWED_PAISE, color: '#0c829a' }, // teal — owed to you
  { paise: SETTLED_PAISE, color: '#eff0f4' }, // grey — settled
  { paise: OWE_PAISE, color: '#ff2834' }, // red — you owe
];

// ── Mock: recent activity, mapped onto Monzo's transaction rows ───────
// net_paise: + you lent (incoming, teal), − you borrowed (outgoing, coral).
const ACTIVITY = [
  { icon: 'restaurant', name: 'Dinner at Toit', group: 'Flat 4B', net: 68000 },
  { icon: 'local_taxi', name: 'Uber to airport', group: 'Goa Trip', net: -24000 },
  { icon: 'shopping_cart', name: 'BigBasket groceries', group: 'Flat 4B', net: 115000 },
  { icon: 'movie', name: 'Movie night', group: 'Goa Trip', net: -36000 },
];

// ── Donut geometry (matches monzo DonutChart: mid radius 108.5, stroke 32,
//    round caps pulled in so rendered arcs land on the intended degrees) ──
const R = 108.5;
const STROKE = 32;
const CAP_DEG = (STROKE / 2 / R) * (180 / Math.PI);
const GAP_DEG = 6; // breathing room between segments

function polar(deg: number): [number, number] {
  const a = ((deg - 90) * Math.PI) / 180;
  return [R * Math.cos(a), R * Math.sin(a)];
}

function arcPath(from: number, to: number): string {
  const [x1, y1] = polar(from);
  const [x2, y2] = polar(to);
  const large = to - from > 180 ? 1 : 0;
  return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
}

function Donut(): JSX.Element {
  const total = SEGMENTS.reduce((s, seg) => s + seg.paise, 0);
  const usable = 360 - GAP_DEG * SEGMENTS.length;
  let cursor = 0;
  const arcs = SEGMENTS.map((seg, i) => {
    const span = (seg.paise / total) * usable;
    const from = cursor + GAP_DEG / 2 + CAP_DEG;
    const to = cursor + GAP_DEG / 2 + span - CAP_DEG;
    cursor += span + GAP_DEG;
    return { d: arcPath(from, to), color: seg.color, i };
  });
  return (
    <div className="hc-donut">
      <svg viewBox="-150 -150 300 300">
        {arcs.map(({ d, color, i }) => (
          <path
            key={i}
            d={d}
            className={`hc-seg hc-seg--anim d${i}`}
            stroke={color}
            strokeWidth={STROKE}
            pathLength={1}
            style={{ strokeDasharray: 1 }}
          />
        ))}
      </svg>
      <div className="hc-donut-center">
        <p className="hc-donut-amount">{rupees0(NET_PAISE)}</p>
        <p className="hc-donut-label">You're owed</p>
      </div>
    </div>
  );
}

function ChevronDown(): JSX.Element {
  return (
    <svg width={14} height={14} viewBox="0 0 14 14" fill="none" aria-hidden>
      <path d="M3 5l4 4 4-4" stroke="#9FA6B2" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LongArrowRight(): JSX.Element {
  return (
    <svg width={44} height={16} viewBox="0 0 44 16" fill="none" aria-hidden>
      <line x1={1} y1={8} x2={41} y2={8} stroke="#fff" strokeWidth={2.4} strokeLinecap="round" />
      <path d="M34 1.5L41.5 8 34 14.5" stroke="#fff" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HomeConcept(): JSX.Element {
  return (
    <div className="home-concept">
      <div className="hc-banner">
        <div className="hc-greeting">
          <h1>Hi Raghav</h1>
          <span>Friday, 10 Jul</span>
        </div>
        <button className="hc-hamburger" aria-label="Menu">
          <span />
          <span />
        </button>
      </div>

      <div className="hc-sheet">
        <span className="hc-handle" />

        <div className="hc-donut-wrap">
          <Donut />
        </div>

        <div className="hc-section">
          <span className="hc-section-title">Recent activity</span>
          <span className="hc-section-action">
            This week <ChevronDown />
          </span>
        </div>

        <div className="hc-list">
          {ACTIVITY.map((a) => {
            const incoming = a.net >= 0;
            return (
              <div className="hc-row" key={a.name}>
                <span className="hc-row__tile">
                  <Icon name={a.icon} />
                </span>
                <div className="hc-row__body">
                  <span className="hc-row__name">{a.name}</span>
                  <span className="hc-row__sub">
                    {a.group} · {incoming ? 'You lent' : 'You owe'}
                  </span>
                </div>
                <span className={`hc-row__amount ${incoming ? 'hc-row__amount--in' : 'hc-row__amount--out'}`}>
                  {incoming ? '+' : '-'}
                  {rupees0(Math.abs(a.net))}
                </span>
              </div>
            );
          })}
        </div>

        <div className="hc-cta">
          <button className="hc-transfer">
            <span>Square Up</span>
            <LongArrowRight />
          </button>
        </div>

        <span className="hc-home-indicator" />
      </div>
    </div>
  );
}
