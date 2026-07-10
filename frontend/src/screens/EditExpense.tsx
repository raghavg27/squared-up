import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient, ApiError, type Expense, type Group } from '../api.js';
import { useStore } from '../store.js';
import { Icon } from '../ui.js';
import { ExpenseFormFields, useExpenseForm } from '../ExpenseForm.js';

export function EditExpense() {
  const { id } = useParams();
  const expId = Number(id);
  const nav = useNavigate();
  const { me } = useStore();
  const [exp, setExp] = useState<Expense | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const form = useExpenseForm();
  const { setDesc, setAmount, setDate, setCategory, setPayer, setParticipants, setSplitType, setPerUser } = form;

  useEffect(() => {
    apiClient.expense(expId).then((e) => {
      setExp(e);
      setDesc(e.description);
      setAmount((e.amount_paise / 100).toString());
      setDate(e.expense_date ?? e.created_at.slice(0, 10));
      setCategory(e.category ?? undefined);
      setPayer(e.shares.find((s) => s.paid_paise > 0)?.user_id ?? me?.id ?? null);
      const owed = e.shares.filter((s) => s.owed_paise > 0);
      setParticipants(owed.map((s) => s.user_id));
      // The API doesn't echo the split type back; owed amounts within 1 paise of
      // each other read as an equal split (largest-remainder rounding), anything
      // else is reconstructed as exact so no one's share silently changes.
      const amounts = owed.map((s) => s.owed_paise);
      if (amounts.length > 0 && Math.max(...amounts) - Math.min(...amounts) > 1) {
        setSplitType('exact');
        const per: Record<number, string> = {};
        for (const s of owed) per[s.user_id] = (s.owed_paise / 100).toString();
        setPerUser(per);
        setDetailsOpen(true);
      }
      if (e.group_id) apiClient.group(e.group_id).then(setGroup).catch(() => {});
    }).catch(() => setErr('Could not load expense'));
  }, [expId, me, setDesc, setAmount, setDate, setCategory, setPayer, setParticipants, setSplitType, setPerUser]);

  const members = group?.members ?? form.participants;

  async function save() {
    if (busy || !exp) return;
    setErr(null);
    const problem = form.validate();
    if (problem) return setErr(problem);
    setBusy(true);
    try {
      await apiClient.updateExpense(expId, {
        group_id: exp.group_id,
        description: form.desc.trim() || 'Expense',
        amount_paise: form.amountPaise,
        currency: 'INR',
        expense_date: form.date,
        category: form.category,
        payers: [{ user_id: form.payer, paid_paise: form.amountPaise }],
        split: form.buildSplit(),
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
    <div className="min-h-screen bg-paper flex flex-col">
      <header className="relative flex items-center justify-center py-4 border-b border-neutral-100">
        <button onClick={() => nav(-1)} className="absolute left-4 w-10 h-10 flex items-center justify-center text-ink active:scale-95 transition-transform">
          <Icon name="close" />
        </button>
        <h1 className="font-heading text-[22px] font-bold text-ink">Edit Expense</h1>
      </header>

      <main className="flex-1 px-mobile pb-4">
        <ExpenseFormFields form={form} members={members} open={detailsOpen} onToggle={() => setDetailsOpen((o) => !o)} />

        {err && <p className="text-danger font-body text-[13px] mt-4 text-center">{err}</p>}

        <div className="mt-6">
          {confirmDel ? (
            <div className="flex gap-3">
              <button onClick={() => setConfirmDel(false)} className="flex-1 h-12 rounded-button border border-neutral-300 text-ink font-body text-[15px] font-medium">Cancel</button>
              <button onClick={del} disabled={busy} className="flex-1 h-12 rounded-button bg-primary text-on-primary font-body text-[15px] font-bold disabled:opacity-60">Delete expense</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)} className="w-full flex items-center justify-center gap-2 h-12 rounded-button border border-neutral-300 text-primary font-body text-[15px] font-medium">
              <Icon name="delete" style={{ fontSize: 20 }} /> Delete expense
            </button>
          )}
        </div>
      </main>

      <div className="px-mobile py-4 border-t border-neutral-100">
        <button onClick={save} disabled={busy} className="w-full h-[56px] bg-primary text-on-primary rounded-button font-heading text-[17px] font-bold active:scale-[0.98] transition-transform disabled:opacity-60">
          {busy ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
