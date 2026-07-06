import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient, ApiError, type Expense, type Group } from '../api.js';
import { useStore } from '../store.js';
import { Avatar, Icon } from '../ui.js';
import { rupees } from '../format.js';

export function EditExpense() {
  const { id } = useParams();
  const expId = Number(id);
  const nav = useNavigate();
  const { me, name } = useStore();
  const [exp, setExp] = useState<Expense | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState('');
  const [payer, setPayer] = useState<number | null>(null);
  const [participants, setParticipants] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiClient.expense(expId).then((e) => {
      setExp(e);
      setDesc(e.description);
      setAmount((e.amount_paise / 100).toString());
      setPayer(e.shares.find((s) => s.paid_paise > 0)?.user_id ?? me?.id ?? null);
      setParticipants(e.shares.filter((s) => s.owed_paise > 0).map((s) => s.user_id));
      if (e.group_id) apiClient.group(e.group_id).then(setGroup).catch(() => {});
    }).catch(() => setErr('Could not load expense'));
  }, [expId, me]);

  const members = group?.members ?? participants;
  const amountPaise = useMemo(() => Math.round(parseFloat(amount || '0') * 100), [amount]);
  const perEqual = participants.length ? Math.round(amountPaise / participants.length) : 0;

  function toggle(uid: number) {
    setParticipants((p) => (p.includes(uid) ? p.filter((x) => x !== uid) : [...p, uid]));
  }

  async function save() {
    if (busy || !exp) return;
    setErr(null);
    if (!(amountPaise > 0)) return setErr('Enter an amount');
    if (participants.length === 0) return setErr('Pick at least one participant');
    setBusy(true);
    try {
      await apiClient.updateExpense(expId, {
        group_id: exp.group_id,
        description: desc.trim() || 'Expense',
        amount_paise: amountPaise,
        currency: 'INR',
        expense_date: exp.expense_date ?? exp.created_at.slice(0, 10),
        payers: [{ user_id: payer, paid_paise: amountPaise }],
        split: { type: 'equal', participants },
      });
      nav(`/expense/${expId}`, { replace: true });
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not save'); setBusy(false); }
  }

  async function del() {
    if (busy || !exp) return;
    setBusy(true);
    try { await apiClient.deleteExpense(expId); nav(exp.group_id ? `/groups/${exp.group_id}` : '/', { replace: true }); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not delete'); setBusy(false); }
  }

  if (!exp) return <div className="min-h-screen bg-paper flex items-center justify-center text-neutral-600 font-body">{err ?? 'Loading…'}</div>;

  return (
    <div className="min-h-screen pb-28 bg-paper">
      <header className="flex items-center justify-between px-mobile py-3 border-b border-neutral-100">
        <button onClick={() => nav(-1)} className="w-10 h-10 flex items-center justify-center text-ink active:scale-95 transition-transform">
          <Icon name="close" />
        </button>
        <h1 className="font-heading text-[22px] font-bold text-ink">Edit Expense</h1>
        <button onClick={save} disabled={busy} className="font-body text-[15px] text-primary font-bold disabled:opacity-60">{busy ? '…' : 'Save'}</button>
      </header>

      <main className="px-mobile flex flex-col gap-5 mt-4">
        <div>
          <label className="font-caption text-caption text-on-surface-variant block mb-2">Description</label>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} className="input-warm" placeholder="What was it for?" />
        </div>
        <div>
          <label className="font-caption text-caption text-on-surface-variant block mb-2">Amount</label>
          <div className="flex items-center gap-2 bg-neutral-100 rounded-button px-4 h-[52px] focus-within:outline focus-within:outline-2 focus-within:outline-primary">
            <span className="font-heading text-[20px] text-ink">₹</span>
            <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className="flex-1 bg-transparent outline-none font-heading text-[20px] text-ink tnum" placeholder="0.00" />
          </div>
        </div>

        <div>
          <label className="font-caption text-caption text-on-surface-variant block mb-2">Paid by</label>
          <div className="flex gap-2 flex-wrap">
            {members.map((uid) => (
              <button key={uid} onClick={() => setPayer(uid)} className={`flex items-center gap-2 rounded-full pl-1 pr-3 py-1 border ${payer === uid ? 'border-primary bg-primary/5' : 'border-neutral-300 bg-surface-container-lowest'}`}>
                <Avatar name={name(uid)} size={26} me={uid === me?.id} />
                <span className="font-body text-[15px] text-ink">{uid === me?.id ? 'You' : name(uid)}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="font-caption text-caption text-on-surface-variant block mb-2">Split equally between</label>
          <div className="flex flex-col gap-2">
            {members.map((uid) => {
              const on = participants.includes(uid);
              return (
                <button key={uid} onClick={() => toggle(uid)} className="bg-surface-container-lowest rounded-card border border-neutral-300 card-shadow px-4 py-3 flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${on ? 'bg-primary text-on-primary' : 'border-2 border-neutral-300'}`}>
                    {on && <Icon name="check" fill style={{ fontSize: 18 }} />}
                  </span>
                  <Avatar name={name(uid)} size={36} me={uid === me?.id} />
                  <span className="flex-1 text-left font-body text-[17px] text-ink">{uid === me?.id ? 'You' : name(uid)}</span>
                  {on && <span className="font-currency text-[15px] text-ink tnum">{rupees(perEqual)}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {err && <p className="text-primary font-caption text-caption">{err}</p>}

        {confirmDel ? (
          <div className="flex gap-3">
            <button onClick={() => setConfirmDel(false)} className="flex-1 h-12 rounded-button border border-neutral-300 text-ink font-body text-[15px] font-medium">Cancel</button>
            <button onClick={del} disabled={busy} className="flex-1 h-12 rounded-button bg-primary text-on-primary font-body text-[15px] font-bold disabled:opacity-60">Delete expense</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDel(true)} className="flex items-center justify-center gap-2 h-12 rounded-button border border-neutral-300 text-primary font-body text-[15px] font-medium">
            <Icon name="delete" style={{ fontSize: 20 }} /> Delete expense
          </button>
        )}
      </main>
    </div>
  );
}
