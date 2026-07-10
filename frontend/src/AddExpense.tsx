import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient, ApiError, type Group } from './api.js';
import { useStore } from './store.js';
import { Icon } from './ui.js';
import { rupees } from './format.js';
import { ExpenseFormFields, useExpenseForm } from './ExpenseForm.js';
import { useToast } from './toast.js';
import { emitDataChanged } from './dataEvents.js';

export function AddExpense() {
  const { id, friendId } = useParams();
  const personal = !id;
  const groupId = personal ? null : Number(id);
  const { me, name } = useStore();
  const nav = useNavigate();
  const { showToast } = useToast();

  const [group, setGroup] = useState<Group | null>(null);
  const personalMembers = useMemo(
    () => (me && friendId ? [me.id, Number(friendId)] : []),
    [me, friendId],
  );
  const members = personal ? personalMembers : (group?.members ?? []);

  const form = useExpenseForm();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [nl, setNl] = useState('');
  const [nlBusy, setNlBusy] = useState(false);
  const [parsed, setParsed] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { setPayer, setParticipants } = form;
  useEffect(() => {
    if (personal) {
      setPayer((p) => p ?? me?.id ?? null);
      setParticipants((cur) => (cur.length ? cur : personalMembers));
      return;
    }
    apiClient.group(groupId!).then((g) => {
      setGroup(g);
      setParticipants((cur) => (cur.length ? cur : g.members));
      // Rotation group (§9.6): pre-fill payer = whose-turn. Fall back to me/first
      // member if the turn can't be computed (e.g. no rotation expenses yet).
      if (g.rotation_enabled) {
        apiClient.turn(groupId!)
          .then((t) => setPayer((p) => p ?? t.next_payer.user_id))
          .catch(() => setPayer((p) => p ?? me?.id ?? g.members[0] ?? null));
      } else {
        setPayer((p) => p ?? me?.id ?? g.members[0] ?? null);
      }
    }).catch(() => {});
  }, [groupId, me, personal, personalMembers, setPayer, setParticipants]);

  // An expense counts toward Turn to Pay only when it's the whole-group equal
  // split a rotation turn is defined as (§9.2): single payer, equal, every active
  // rotation member. Subset / unequal / uneven splits stay regular expenses.
  const isRotation =
    !!group?.rotation_enabled &&
    form.splitType === 'equal' &&
    members.length > 0 &&
    form.participants.length === members.length &&
    members.every((m) => form.participants.includes(m));

  async function runParse() {
    if (!nl.trim() || nlBusy) return;
    setNlBusy(true); setErr(null);
    try {
      const d = await apiClient.parse(nl, members.map((mid) => name(mid)));
      const byName = (n: string) => members.find((mid) => name(mid).toLowerCase() === n.toLowerCase());
      form.setDesc(d.description);
      if (d.amount_paise !== null) form.setAmount((d.amount_paise / 100).toString());
      const payerId = d.payer_name != null ? byName(d.payer_name) : undefined;
      if (payerId !== undefined) form.setPayer(payerId);
      else if (d.i_paid && me) form.setPayer(me.id);
      const matched = d.participant_names
        .map(byName)
        .filter((x): x is number => x !== undefined);
      form.setParticipants(matched.length > 0 ? matched : members);
      if (d.split_type === 'exact' && d.exact_amounts_paise) {
        const per: Record<number, string> = {};
        for (const [n, paise] of Object.entries(d.exact_amounts_paise)) {
          const uid = byName(n);
          if (uid !== undefined) per[uid] = (paise / 100).toString();
        }
        form.setSplitType('exact'); form.setPerUser(per);
      } else {
        form.setSplitType('equal');
      }
      setParsed(true);
      // Low-confidence or rules-fallback parses deserve a visual once-over.
      if (d.confidence < 0.7 || d.source === 'rules' || d.split_type === 'exact') setDetailsOpen(true);
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not parse that — fill the form below'); }
    finally { setNlBusy(false); }
  }

  async function save() {
    if (busy || !me) return;
    setErr(null);
    const problem = form.validate();
    if (problem) return setErr(problem);
    setBusy(true);
    try {
      const created = await apiClient.createExpense({
        group_id: personal ? null : groupId,
        description: form.desc.trim() || nl.trim() || 'Expense',
        amount_paise: form.amountPaise,
        currency: 'INR',
        expense_date: form.date,
        source: nl ? 'nl' : 'manual',
        is_rotation: isRotation,
        created_by: me.id,
        payers: [{ user_id: form.payer, paid_paise: form.amountPaise }],
        split: form.buildSplit(),
      });
      if (navigator.vibrate) navigator.vibrate(20);
      showToast(`Added ${rupees(form.amountPaise)} — ${form.desc.trim() || 'Expense'}`, {
        label: 'Undo',
        run: async () => {
          await apiClient.deleteExpense(created.id);
          emitDataChanged();
        },
      });
      nav(personal ? '/' : `/groups/${groupId}`, { replace: true });
    } catch (e) { setErr(e instanceof ApiError ? e.message : "That didn't save — check your connection and try again"); setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 bg-surface-dim flex flex-col max-w-[28rem] mx-auto">
      {/* grey backdrop tap area */}
      <button className="h-16 w-full shrink-0" onClick={() => nav(-1)} aria-label="Close" />
      <div className="flex-1 bg-surface-container-lowest rounded-t-[28px] flex flex-col overflow-hidden sheet-up">
        {/* header */}
        <div className="relative flex items-center justify-center py-4 border-b border-neutral-100">
          <button onClick={() => nav(-1)} className="absolute left-4 w-10 h-10 flex items-center justify-center text-ink active:scale-95 transition-transform">
            <Icon name="close" />
          </button>
          <h1 className="font-heading text-[22px] font-bold text-ink">
            {personal && friendId ? `With ${name(Number(friendId))}` : 'Add Expense'}
          </h1>
        </div>

        <div className="flex-1 overflow-y-auto px-mobile pb-4">
          {/* smart entry — the primary fast path, so it leads and gets focus */}
          <div className="bg-neutral-100 rounded-card flex items-center gap-2 px-4 py-4 mt-5">
            <Icon name="auto_awesome" fill className="text-primary" style={{ fontSize: 22 }} />
            <input
              value={nl}
              onChange={(e) => setNl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runParse()}
              autoFocus
              placeholder="Type it — auto 240 Neha ke saath, I paid"
              className="flex-1 bg-transparent outline-none font-body text-[16px] text-ink placeholder:text-secondary"
            />
            {nl && (
              <button onClick={runParse} disabled={nlBusy} className="bg-primary text-on-primary rounded-full px-3.5 py-1.5 font-body text-[13px] font-semibold shrink-0 disabled:opacity-60">
                {nlBusy ? '…' : 'Fill'}
              </button>
            )}
          </div>
          {parsed && !err && (
            <p className="font-caption text-caption text-secondary text-center mt-2">Filled in below — check it, then add.</p>
          )}

          <ExpenseFormFields form={form} members={members} open={detailsOpen} onToggle={() => setDetailsOpen((o) => !o)} />

          {err && <p className="text-danger font-body text-[13px] mt-4 text-center">{err}</p>}
        </div>

        {/* footer */}
        <div className="px-mobile py-4 border-t border-neutral-100">
          <button onClick={save} disabled={busy} className="w-full h-[56px] bg-primary text-on-primary rounded-button font-heading text-[17px] font-bold active:scale-[0.98] transition-transform disabled:opacity-60">
            {busy ? 'Adding…' : 'Add Expense'}
          </button>
        </div>
      </div>
    </div>
  );
}
