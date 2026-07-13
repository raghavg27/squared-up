import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient, ApiError, type Expense, type Group } from '../api.js';
import { useStore } from '../store.js';
import { Icon } from '../ui.js';
import { PageBanner } from '../banners.js';
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
      <PageBanner title="Edit Expense" sub={exp.description} />

      <main className="monzo-sheet mx-3 -mt-9 px-6 pb-6 flex-1">
        <span className="sheet-handle" />
        <ExpenseFormFields form={form} members={members} open={detailsOpen} onToggle={() => setDetailsOpen((o) => !o)} />

        {err && <p className="text-danger font-body text-[13px] font-semibold mt-4 text-center">{err}</p>}

        <div className="mt-6">
          {confirmDel ? (
            <div className="flex gap-3">
              <button onClick={() => setConfirmDel(false)} className="flex-1 h-12 rounded-full bg-surface shadow-soft text-ink font-body text-[15px] font-bold">Cancel</button>
              <button onClick={del} disabled={busy} className="flex-1 h-12 rounded-full bg-primary text-on-primary shadow-coral font-body text-[15px] font-bold disabled:opacity-60">Delete expense</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)} className="w-full flex items-center justify-center gap-2 h-12 rounded-full bg-surface shadow-soft text-primary font-body text-[15px] font-bold">
              <Icon name="delete" style={{ fontSize: 20 }} /> Delete expense
            </button>
          )}
        </div>
      </main>

      <div className="px-6 py-4">
        <button onClick={save} disabled={busy} className="btn-coral justify-center text-[17px]">
          {busy ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
