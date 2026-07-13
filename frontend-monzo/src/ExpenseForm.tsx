import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './store.js';
import { EXPENSE_CATEGORIES } from './api.js';
import { Avatar, Icon, categoryStyle, guessCategory } from './ui.js';
import { rupees } from './format.js';

export type SplitType = 'equal' | 'exact' | 'shares';

export interface ExpenseSplit {
  type: SplitType;
  participants: number[];
  amounts_paise?: Record<string, number>;
  shares?: Record<string, number>;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function dateLabel(iso: string): string {
  if (iso === todayIso()) return 'Today';
  const d = new Date(iso + 'T00:00:00');
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (iso === yesterday.toISOString().slice(0, 10)) return 'Yesterday';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** All form state + money math for add/edit expense. Parent owns fetching/saving. */
export function useExpenseForm() {
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState(''); // rupees string
  const [date, setDate] = useState(todayIso());
  // undefined = no explicit pick → the server auto-categorizes from the
  // description; set by the user (chip tap), NL parse, or a receipt scan.
  const [category, setCategory] = useState<string | undefined>(undefined);
  const [payer, setPayer] = useState<number | null>(null);
  const [participants, setParticipants] = useState<number[]>([]);
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [perUser, setPerUser] = useState<Record<number, string>>({});

  const amountPaise = useMemo(() => Math.round(parseFloat(amount || '0') * 100), [amount]);
  const perEqual = participants.length ? Math.round(amountPaise / participants.length) : 0;
  const exactTotal = participants.reduce((s, id) => s + Math.round(parseFloat(perUser[id] || '0') * 100), 0);
  const exactRemaining = amountPaise - exactTotal;

  function shareFor(uid: number): number {
    if (!participants.includes(uid)) return 0;
    if (splitType === 'equal') return perEqual;
    if (splitType === 'exact') return Math.round(parseFloat(perUser[uid] || '0') * 100);
    const totalShares = participants.reduce((s, id) => s + (parseInt(perUser[id] || '1', 10) || 0), 0) || 1;
    return Math.round((amountPaise * (parseInt(perUser[uid] || '1', 10) || 0)) / totalShares);
  }

  function buildSplit(): ExpenseSplit {
    if (splitType === 'equal') return { type: 'equal', participants };
    if (splitType === 'exact') {
      const amounts_paise: Record<string, number> = {};
      for (const id of participants) amounts_paise[id] = Math.round(parseFloat(perUser[id] || '0') * 100);
      return { type: 'exact', participants, amounts_paise };
    }
    const shares: Record<string, number> = {};
    for (const id of participants) shares[id] = parseInt(perUser[id] || '1', 10);
    return { type: 'shares', participants, shares };
  }

  function validate(): string | null {
    if (!(amountPaise > 0)) return 'Enter an amount';
    if (participants.length === 0) return 'Pick at least one participant';
    if (payer === null) return 'Pick who paid';
    if (splitType === 'exact' && exactRemaining !== 0) {
      return exactRemaining > 0
        ? `${rupees(exactRemaining)} left to assign`
        : `Assigned ${rupees(-exactRemaining)} too much`;
    }
    return null;
  }

  return {
    desc, setDesc, amount, setAmount, date, setDate, category, setCategory,
    payer, setPayer,
    participants, setParticipants, splitType, setSplitType, perUser, setPerUser,
    amountPaise, perEqual, exactRemaining, shareFor, buildSplit, validate,
  };
}

export type ExpenseForm = ReturnType<typeof useExpenseForm>;

interface FieldsProps {
  form: ExpenseForm;
  members: number[];
  open: boolean;
  onToggle: () => void;
  // Itemized-bill mode: the per-item editor owns the split, so only the payer is
  // editable here (the split-type + participants blocks are hidden).
  itemize?: boolean;
}

/** Amount + description + date, then a one-line payer/split summary that expands
    into the full payer / split-type / participants editor. */
export function ExpenseFormFields({ form, members, open, onToggle, itemize = false }: FieldsProps) {
  const { me, name } = useStore();
  const [payerOpen, setPayerOpen] = useState(false);
  const f = form;

  const who = (uid: number | null) => (uid === me?.id ? 'You' : uid !== null ? name(uid) : '—');
  const splitLabel = f.splitType === 'equal' ? 'split equally' : f.splitType === 'exact' ? 'split by amounts' : 'split by shares';
  const allOn = members.length > 0 && f.participants.length === members.length;
  // Solo group (personal tracker): payer/split is always "you, all of it" —
  // hide the whole editor instead of showing a one-person picker.
  const solo = members.length === 1 && members[0] === me?.id;

  // Active chip = explicit pick, else live guess from the description. Keep it
  // scrolled into view — the suggestion is useless if it lights up off-screen.
  const activeCat = f.category ?? (f.desc.trim() ? guessCategory(f.desc) : undefined);
  const chipRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    chipRow.current?.querySelector('[aria-checked="true"]')
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [activeCat]);

  return (
    <>
      {/* amount */}
      <div className="flex items-center justify-center gap-3 mt-6">
        <span className="font-heading text-[40px] text-ink">₹</span>
        <input
          value={f.amount}
          onChange={(e) => f.setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          inputMode="decimal"
          placeholder="0.00"
          className="font-heading text-[48px] font-bold text-ink tnum bg-transparent outline-none text-center w-[220px] placeholder:text-neutral-300"
        />
      </div>

      {/* description */}
      <input
        value={f.desc}
        onChange={(e) => f.setDesc(e.target.value)}
        placeholder="What's it for? e.g. Dinner at Toit"
        className="w-full text-center bg-transparent outline-none font-body text-[17px] text-ink placeholder:text-neutral-600 mt-3"
      />

      {/* date chip — invisible native input on top so a tap opens the picker */}
      <div className="flex justify-center mt-3">
        <label className="relative flex items-center gap-1.5 bg-neutral-100 rounded-full px-3 py-1.5 active:scale-95 transition-transform">
          <Icon name="calendar_today" className="text-secondary" style={{ fontSize: 16 }} />
          <span className="font-body text-[13px] font-medium text-ink">{dateLabel(f.date)}</span>
          <input
            type="date"
            value={f.date}
            max={todayIso()}
            onChange={(e) => e.target.value && f.setDate(e.target.value)}
            // opacity-0 hides the native calendar indicator, so a tap on the
            // chip body would otherwise never open the picker — force it open.
            onClick={(e) => { try { e.currentTarget.showPicker(); } catch { /* unsupported */ } }}
            className="absolute inset-0 w-full h-full opacity-0"
            aria-label="Expense date"
          />
        </label>
      </div>

      {/* category — auto-suggested from the description, tap a chip to correct
          it (the guess can be wrong; the user's pick always wins) */}
      <div ref={chipRow} className="flex gap-2 overflow-x-auto mt-4 pb-1" role="radiogroup" aria-label="Category">
        {EXPENSE_CATEGORIES.map((c) => {
          const on = activeCat === c;
          const st = categoryStyle(c);
          return (
            <button
              key={c}
              role="radio"
              aria-checked={on}
              onClick={() => f.setCategory(f.category === c ? undefined : c)}
              className={`flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1.5 font-body text-[13px] font-medium transition-colors ${on ? 'bg-primary text-on-primary' : 'bg-neutral-100 text-secondary'}`}
            >
              <Icon name={st.icon} style={{ fontSize: 16 }} />
              {c}
            </button>
          );
        })}
      </div>

      {/* payer + split card: summary row on top, editor expands inside the
          same card so the whole thing reads as one control */}
      {!solo && (
      <div className="bg-surface-container-lowest rounded-card shadow-soft mt-6">
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-center gap-3 text-left">
        <Avatar name={f.payer !== null ? name(f.payer) : ''} size={32} me={f.payer === me?.id} />
        <span className="flex-1">
          <span className="block font-body text-[15px] font-medium text-ink">{who(f.payer)} paid · {itemize ? 'itemized' : splitLabel}</span>
          <span className="block font-caption text-caption text-secondary mt-0.5">
            {itemize ? 'Split by item — see below' : (
              <>
                {f.participants.length} of {members.length} people
                {f.splitType === 'equal' && f.amountPaise > 0 && f.participants.length > 0 ? ` · ${rupees(f.perEqual)} each` : ''}
              </>
            )}
          </span>
        </span>
        <Icon name="expand_more" className={`text-neutral-600 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-4 pt-3 border-t border-neutral-100 page-enter">
          {/* paid by */}
          <div className="relative flex items-center justify-between">
            <span className="font-body text-[15px] font-semibold text-ink">Paid by</span>
            <button onClick={() => setPayerOpen((o) => !o)} className="flex items-center gap-2 bg-surface-container rounded-full pl-1 pr-3 py-1 active:scale-95 transition-transform">
              <Avatar name={f.payer !== null ? name(f.payer) : ''} size={28} me={f.payer === me?.id} />
              <span className="font-body text-[17px] text-ink">{who(f.payer)}</span>
              <Icon name="expand_more" className="text-neutral-600" style={{ fontSize: 20 }} />
            </button>
            {payerOpen && (
              <div className="absolute right-0 top-11 z-10 bg-surface-container-lowest rounded-button shadow-lift overflow-hidden min-w-[160px]">
                {members.map((uid) => (
                  <button key={uid} onClick={() => { f.setPayer(uid); setPayerOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-surface-container text-left">
                    <Avatar name={name(uid)} size={24} me={uid === me?.id} />
                    <span className="font-body text-[15px] text-ink">{who(uid)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {!itemize && (<>
          {/* split type */}
          <div className="bg-neutral-100 rounded-button p-1 flex mt-4">
            {(['equal', 'exact', 'shares'] as SplitType[]).map((t) => (
              <button
                key={t}
                onClick={() => f.setSplitType(t)}
                className={`flex-1 h-11 rounded-[9px] font-body text-[17px] font-medium capitalize transition-colors ${f.splitType === t ? 'bg-surface-container-lowest text-primary card-shadow' : 'text-secondary'}`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* participants */}
          <div className="flex items-center justify-between mt-5 mb-3">
            <p className="font-caption text-caption text-secondary tracking-wide">PARTICIPANTS</p>
            <button
              onClick={() => f.setParticipants(allOn ? [] : [...members])}
              className="font-body text-[13px] font-semibold text-primary"
            >
              {allOn ? 'Clear all' : 'Select all'}
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {members.map((uid) => {
              const on = f.participants.includes(uid);
              return (
                <div key={uid} className="bg-surface-container-lowest rounded-card shadow-soft px-4 py-3 flex items-center gap-3">
                  <button
                    onClick={() => f.setParticipants(on ? f.participants.filter((x) => x !== uid) : [...f.participants, uid])}
                    className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors ${on ? 'bg-primary text-on-primary' : 'border-2 border-neutral-300'}`}
                  >
                    {on && <Icon name="check" fill style={{ fontSize: 18 }} />}
                  </button>
                  <Avatar name={name(uid)} size={40} me={uid === me?.id} />
                  <span className="flex-1 font-body text-[17px] text-ink">{who(uid)}</span>
                  {f.splitType === 'equal' ? (
                    <span className="font-currency text-[17px] text-ink tnum">{on ? rupees(f.shareFor(uid)) : '—'}</span>
                  ) : on ? (
                    <div className="flex items-center gap-1">
                      <span className="font-currency text-[15px] text-neutral-600">{f.splitType === 'exact' ? '₹' : '×'}</span>
                      <input
                        value={f.perUser[uid] ?? ''}
                        onChange={(e) => f.setPerUser({ ...f.perUser, [uid]: e.target.value.replace(/[^0-9.]/g, '') })}
                        placeholder={f.splitType === 'exact' ? '0' : '1'}
                        inputMode="decimal"
                        className="w-16 bg-neutral-100 rounded-md px-2 py-1 font-currency text-[15px] text-ink text-right outline-none focus:outline-2 focus:outline-primary"
                      />
                    </div>
                  ) : (
                    <span className="font-currency text-[17px] text-neutral-300 tnum">—</span>
                  )}
                </div>
              );
            })}
          </div>

          {f.splitType === 'exact' && f.amountPaise > 0 && f.exactRemaining !== 0 && (
            <p className={`font-caption text-caption mt-3 text-center ${f.exactRemaining > 0 ? 'text-amber' : 'text-danger'}`}>
              {f.exactRemaining > 0 ? `${rupees(f.exactRemaining)} left to assign` : `${rupees(-f.exactRemaining)} over — adjust the amounts`}
            </p>
          )}
          </>)}
        </div>
      )}
      </div>
      )}
    </>
  );
}
