import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store.js';
import { rupees } from '../format.js';
import { Avatar, Icon } from '../ui.js';
import { shareText } from '../share.js';

// The coral "Square Up" pill plus the per-person moves it expands into:
// debts to pay (tap → settle screen) and dues to collect (tap → share a
// reminder). Home computes the nets; this owns the interaction.
export interface Moves {
  gets: [number, number][];
  pays: [number, number][];
  oweSrc: Map<number, { path: string; amount: number }>;
}

export function SquareUpMoves({ moves }: { moves: Moves }) {
  const { me, name } = useStore();
  const nav = useNavigate();
  const [remindMsg, setRemindMsg] = useState<string | null>(null);
  const [remindingId, setRemindingId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const settled = moves.gets.length === 0 && moves.pays.length === 0;

  const flash = (m: string) => { setRemindMsg(m); setTimeout(() => setRemindMsg(null), 2500); };

  // A per-person nudge, worded as if Squared Up composed it on the user's
  // behalf. The user forwards this to that one debtor — nothing about anyone
  // else's balance leaks into it.
  async function remindOne(uid: number, paise: number) {
    if (!me) return;
    setRemindingId(uid);
    const myName = (me.name ?? '').trim().split(/\s+/)[0] || 'your friend';
    // Only offer a UPI handle when one is actually on the profile — never a
    // dangling "settle up over UPI:" with nothing after it.
    const vpa = me.upi_vpa?.trim();
    const payLine = vpa ? `\n\nYou can settle up over UPI: ${vpa}` : '';
    const msg =
      `Hi ${name(uid)}, a gentle reminder from Squared Up 👋\n\n` +
      `You have a pending balance of ${rupees(paise)} with ${myName}. ` +
      `Whenever it's convenient, it'd be great to square things up.${payLine}\n\n` +
      `— Sent via Squared Up, keeping shared expenses fair and friendly.`;
    try {
      const out = await shareText(msg, `Reminder for ${name(uid)}`);
      if (out === 'copied') flash(`Reminder for ${name(uid)} copied — send it over`);
      else if (out === 'failed') flash("Couldn't open share — try again");
    } finally {
      setRemindingId(null);
    }
  }

  return (
    <section className="px-6 mt-6">
      <button onClick={() => setOpen((o) => !o)} className="btn-coral">
        <span>Square Up</span>
        <Icon name={open ? 'expand_less' : 'arrow_right_alt'} style={{ fontSize: 30 }} />
      </button>
      {remindMsg && <p className="font-caption text-caption text-neutral-600 text-center mt-2">{remindMsg}</p>}

      {open && (
        <div className="mt-4 flex flex-col gap-4 page-enter">
          {settled ? (
            <div className="flex flex-col items-center text-center gap-2 py-2">
              <div className="w-12 h-12 rounded-full bg-teal/15 text-teal flex items-center justify-center">
                <Icon name="check" fill style={{ fontSize: 28 }} />
              </div>
              <p className="font-heading text-[17px] font-bold text-ink">You're all squared up!</p>
              <p className="font-caption text-caption text-neutral-600">Nothing to pay, nothing to collect — with everyone.</p>
            </div>
          ) : (
            <>
              <p className="font-body text-[13px] font-semibold text-neutral-600 tracking-wide">TO GET FULLY SQUARED UP</p>
              {moves.pays.map(([uid, n]) => {
                const src = moves.oweSrc.get(uid);
                return (
                  <button key={`p${uid}`} onClick={() => src && nav(src.path)} className="flex items-center gap-3 active:scale-[0.98] transition-transform">
                    <Avatar name={name(uid)} size={49} />
                    <div className="flex flex-col flex-1 min-w-0 text-left">
                      <span className="font-body text-[16px] font-bold text-ink truncate">Pay {name(uid)}</span>
                      <span className="font-body text-[12.5px] font-semibold text-neutral-600">Tap to settle</span>
                    </div>
                    <span className="font-body text-[16px] font-extrabold text-primary tnum">-{rupees(-n)}</span>
                    <Icon name="chevron_right" className="text-neutral-600" style={{ fontSize: 20 }} />
                  </button>
                );
              })}
              {moves.gets.map(([uid, n]) => (
                <button
                  key={`g${uid}`}
                  onClick={() => remindOne(uid, n)}
                  disabled={remindingId === uid}
                  className="flex items-center gap-3 active:scale-[0.98] transition-transform disabled:opacity-60"
                >
                  <Avatar name={name(uid)} size={49} />
                  <div className="flex flex-col flex-1 min-w-0 text-left">
                    <span className="font-body text-[16px] font-bold text-ink truncate">Get from {name(uid)}</span>
                    <span className="font-body text-[12.5px] font-semibold text-neutral-600">
                      {remindingId === uid ? 'Sharing…' : 'Tap to remind'}
                    </span>
                  </div>
                  <span className="font-body text-[16px] font-extrabold text-teal tnum">+{rupees(n)}</span>
                  <Icon name="notifications" className="text-neutral-600" style={{ fontSize: 20 }} />
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </section>
  );
}
