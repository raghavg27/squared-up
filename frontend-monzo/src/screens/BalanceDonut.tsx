import { rupees0 } from '../format.js';

// Monzo-concept balance donut: mid radius 108.5, stroke 32, round caps pulled
// in so the rendered arcs land on the intended degrees (see
// monzo-concept-ui/DESIGN_ANALYSIS.md). Teal = owed to you, red = you owe;
// fully settled renders one grey ring.
const R = 108.5;
const STROKE = 32;
const CAP_DEG = (STROKE / 2 / R) * (180 / Math.PI);
const GAP_DEG = 6;

const TEAL = '#0c829a';
const RED = '#ff2834';
const GREY = '#eff0f4';

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

export function BalanceDonut({ owedPaise, owePaise }: { owedPaise: number; owePaise: number }) {
  const settled = owedPaise === 0 && owePaise === 0;
  const net = owedPaise - owePaise;

  // Segments never shrink below a visible sliver; a grey filler keeps the ring
  // closed so a lopsided balance still reads as a donut, not a lone arc.
  const segments: { value: number; color: string }[] = [];
  if (!settled) {
    const total = owedPaise + owePaise;
    if (owedPaise > 0) segments.push({ value: Math.max(owedPaise, total * 0.04), color: TEAL });
    segments.push({ value: total * 0.35, color: GREY });
    if (owePaise > 0) segments.push({ value: Math.max(owePaise, total * 0.04), color: RED });
  }

  const total = segments.reduce((s, seg) => s + seg.value, 0);
  const usable = 360 - GAP_DEG * segments.length;
  let cursor = 0;
  const arcs = segments.map((seg, i) => {
    const span = (seg.value / total) * usable;
    const from = cursor + GAP_DEG / 2 + CAP_DEG;
    const to = cursor + GAP_DEG / 2 + span - CAP_DEG;
    cursor += span + GAP_DEG;
    return { d: arcPath(from, Math.max(to, from + 0.5)), color: seg.color, i };
  });

  return (
    <div className="relative w-[272px] h-[272px] mx-auto">
      <svg viewBox="-150 -150 300 300" className="w-full h-full overflow-visible [filter:drop-shadow(0_6px_12px_rgba(20,33,60,0.08))]">
        {settled ? (
          <circle r={R} fill="none" stroke={GREY} strokeWidth={STROKE} />
        ) : (
          arcs.map(({ d, color, i }) => (
            <path
              key={i}
              d={d}
              className="donut-sweep"
              style={{ animationDelay: `${i * 0.15}s`, strokeDasharray: 1 }}
              stroke={color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
              pathLength={1}
            />
          ))
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        <p className="font-heading text-[38px] font-extrabold text-ink leading-[1.05] tracking-[-1.5px] tnum">
          {rupees0(Math.abs(net))}
        </p>
        <p className="font-body text-[15px] font-semibold text-neutral-600 mt-0.5">
          {settled ? 'All squared up' : net >= 0 ? "You're owed" : 'You owe'}
        </p>
      </div>
    </div>
  );
}
