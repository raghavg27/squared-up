import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient, type Group } from './api.js';
import { useStore } from './store.js';
import { Avatar, Icon } from './ui.js';
import { rupees } from './format.js';

type SplitType = 'equal' | 'exact' | 'shares';

export function AddExpense() {
  const { id } = useParams();
  const groupId = Number(id);
  const { me, name } = useStore();
  const nav = useNavigate();

  const [group, setGroup] = useState<Group | null>(null);
  const members = group?.members ?? [];

  const [nl, setNl] = useState('');
  const [nlBusy, setNlBusy] = useState(false);
  const [desc, setDesc] = useState('');
  const [amount, setAmount] = useState(''); // rupees string
  const [payer, setPayer] = useState<number | null>(null);
  const [payerOpen, setPayerOpen] = useState(false);
  const [participants, setParticipants] = useState<number[]>([]);
  const [splitType, setSplitType] = useState<SplitType>('equal');
  const [perUser, setPerUser] = useState<Record<number, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const amtRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    apiClient.group(groupId).then((g) => {
      setGroup(g);
      setPayer((p) => p ?? me?.id ?? g.members[0] ?? null);
      setParticipants((cur) => (cur.length ? cur : g.members));
    }).catch(() => {});
  }, [groupId, me]);

  const amountPaise = useMemo(() => Math.round(parseFloat(amount || '0') * 100), [amount]);
  const perEqual = participants.length ? Math.round(amountPaise / participants.length) : 0;

  function shareFor(uid: number): number {
    if (!participants.includes(uid)) return 0;
    if (splitType === 'equal') return perEqual;
    if (splitType === 'exact') return Math.round(parseFloat(perUser[uid] || '0') * 100);
    // shares
    const totalShares = participants.reduce((s, id) => s + (parseInt(perUser[id] || '1', 10) || 0), 0) || 1;
    return Math.round((amountPaise * (parseInt(perUser[uid] || '1', 10) || 0)) / totalShares);
  }

  async function runParse() {
    if (!nl.trim()) return;
    setNlBusy(true); setErr(null);
    try {
      const d = await apiClient.parse(nl);
      setDesc(d.description);
      if (d.amount_paise !== null) setAmount((d.amount_paise / 100).toString());
      if (d.i_paid && me) setPayer(me.id);
      const matched = members.filter((mid) => mid === me?.id || d.mentioned_names.some((n) => name(mid).toLowerCase() === n.toLowerCase()));
      setParticipants(matched.length > 1 ? matched : members);
    } catch (e) { setErr(String(e)); }
    finally { setNlBusy(false); }
  }

  function toggleParticipant(uid: number) {
    setParticipants((p) => (p.includes(uid) ? p.filter((x) => x !== uid) : [...p, uid]));
  }

  function buildSplit() {
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

  async function save() {
    if (busy || !me) return;
    setErr(null);
    if (!(amountPaise > 0)) return setErr('Enter an amount');
    if (participants.length === 0) return setErr('Pick at least one participant');
    setBusy(true);
    try {
      await apiClient.createExpense({
        group_id: groupId,
        description: desc.trim() || nl.trim() || 'Expense',
        amount_paise: amountPaise,
        currency: 'INR',
        expense_date: new Date().toISOString().slice(0, 10),
        source: nl ? 'nl' : 'manual',
        is_rotation: false,
        created_by: me.id,
        payers: [{ user_id: payer, paid_paise: amountPaise }],
        split: buildSplit(),
      });
      nav(`/groups/${groupId}`, { replace: true });
    } catch (e) { setErr(String(e)); setBusy(false); }
  }

  const others = Math.max(participants.length - 1, 0);

  return (
    <div className="fixed inset-0 z-50 bg-surface-dim flex flex-col max-w-[28rem] mx-auto">
      {/* grey backdrop tap area */}
      <button className="h-16 w-full shrink-0" onClick={() => nav(-1)} aria-label="Close" />
      <div className="flex-1 bg-surface-container-lowest rounded-t-[28px] flex flex-col overflow-hidden">
        {/* header */}
        <div className="relative flex items-center justify-center py-4 border-b border-neutral-100">
          <button onClick={() => nav(-1)} className="absolute left-4 w-10 h-10 flex items-center justify-center text-ink active:scale-95 transition-transform">
            <Icon name="close" />
          </button>
          <h1 className="font-heading text-[22px] font-bold text-ink">Add Expense</h1>
        </div>

        <div className="flex-1 overflow-y-auto px-mobile pb-4">
          {/* amount */}
          <p className="text-center font-body text-[15px] text-secondary mt-6">With you and {others} other{others === 1 ? '' : 's'}</p>
          <div className="flex items-center justify-center gap-3 mt-2">
            <span className="font-heading text-[40px] text-ink">₹</span>
            <input
              ref={amtRef}
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
              inputMode="decimal"
              placeholder="0.00"
              className="font-heading text-[48px] font-bold text-ink tnum bg-transparent outline-none text-center w-[220px] placeholder:text-ink"
            />
          </div>

          {/* smart entry */}
          <div className="bg-neutral-100 rounded-button flex items-center gap-2 px-4 py-3 mt-6">
            <Icon name="auto_awesome" fill className="text-primary" style={{ fontSize: 22 }} />
            <input
              value={nl}
              onChange={(e) => setNl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runParse()}
              placeholder="e.g. auto 240 Neha ke saath, I paid"
              className="flex-1 bg-transparent outline-none font-body text-[15px] text-ink placeholder:text-secondary"
            />
            {nl && (
              <button onClick={runParse} disabled={nlBusy} className="text-primary font-body text-[13px] font-semibold shrink-0">
                {nlBusy ? '…' : 'Parse'}
              </button>
            )}
          </div>

          {/* paid by */}
          <div className="bg-surface-container-lowest rounded-card border border-neutral-300 card-shadow p-4 mt-6 relative">
            <div className="flex items-center justify-between">
              <span className="font-heading text-[22px] font-semibold text-ink">Paid by</span>
              <button onClick={() => setPayerOpen((o) => !o)} className="flex items-center gap-2 bg-surface-container rounded-full pl-1 pr-3 py-1 active:scale-95 transition-transform">
                <Avatar name={payer ? name(payer) : ''} size={28} me={payer === me?.id} />
                <span className="font-body text-[17px] text-ink">{payer === me?.id ? 'You' : (payer ? name(payer) : '—')}</span>
                <Icon name="expand_more" className="text-neutral-600" style={{ fontSize: 20 }} />
              </button>
            </div>
            {payerOpen && (
              <div className="absolute right-4 top-16 z-10 bg-surface-container-lowest rounded-button border border-neutral-300 shadow-lg overflow-hidden min-w-[160px]">
                {members.map((uid) => (
                  <button key={uid} onClick={() => { setPayer(uid); setPayerOpen(false); }} className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-surface-container text-left">
                    <Avatar name={name(uid)} size={24} me={uid === me?.id} />
                    <span className="font-body text-[15px] text-ink">{uid === me?.id ? 'You' : name(uid)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* split segmented */}
          <div className="bg-neutral-100 rounded-button p-1 flex mt-6">
            {(['equal', 'exact', 'shares'] as SplitType[]).map((t) => (
              <button
                key={t}
                onClick={() => setSplitType(t)}
                className={`flex-1 h-11 rounded-[9px] font-body text-[17px] font-medium capitalize transition-colors ${splitType === t ? 'bg-surface-container-lowest text-primary card-shadow' : 'text-secondary'}`}
              >
                {t}
              </button>
            ))}
          </div>

          {/* participants */}
          <p className="font-caption text-caption text-secondary tracking-wide mt-6 mb-3">PARTICIPANTS</p>
          <div className="flex flex-col gap-3">
            {members.map((uid) => {
              const on = participants.includes(uid);
              return (
                <div key={uid} className="bg-surface-container-lowest rounded-card border border-neutral-300 card-shadow px-4 py-3 flex items-center gap-3">
                  <button onClick={() => toggleParticipant(uid)} className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 transition-colors ${on ? 'bg-primary text-on-primary' : 'border-2 border-neutral-300'}`}>
                    {on && <Icon name="check" fill style={{ fontSize: 18 }} />}
                  </button>
                  <Avatar name={name(uid)} size={40} me={uid === me?.id} />
                  <span className="flex-1 font-body text-[17px] text-ink">{uid === me?.id ? 'You' : name(uid)}</span>
                  {splitType === 'equal' ? (
                    <span className="font-currency text-[17px] text-ink tnum">{rupees(shareFor(uid))}</span>
                  ) : on ? (
                    <div className="flex items-center gap-1">
                      <span className="font-currency text-[15px] text-neutral-600">{splitType === 'exact' ? '₹' : '×'}</span>
                      <input
                        value={perUser[uid] ?? ''}
                        onChange={(e) => setPerUser((p) => ({ ...p, [uid]: e.target.value.replace(/[^0-9.]/g, '') }))}
                        placeholder={splitType === 'exact' ? '0' : '1'}
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

          {err && <p className="text-danger font-body text-[13px] mt-4">{err}</p>}
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
