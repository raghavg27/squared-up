import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiClient, type Balances, type Expense, type Group, type Turn } from '../api.js';
import { useStore } from '../store.js';
import { rupees, rupees0 } from '../format.js';
import { Avatar, Icon, categoryFor } from '../ui.js';
import { shareText } from '../share.js';

export function GroupDetail() {
  const { id } = useParams();
  const groupId = Number(id);
  const { me, name } = useStore();
  const nav = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [turn, setTurn] = useState<Turn | null>(null);

  const reload = useCallback(() => {
    apiClient.group(groupId).then(setGroup).catch(() => {});
    apiClient.balances(groupId).then(setBalances).catch(() => {});
    apiClient.expenses(groupId).then((e) => setExpenses(e.slice(0, 8))).catch(() => {});
    apiClient.turn(groupId).then(setTurn).catch(() => setTurn(null));
  }, [groupId]);
  useEffect(reload, [reload]);

  const myNet = balances?.members.find((m) => m.user_id === me?.id)?.net_paise ?? 0;
  const owe = myNet < 0;
  const total = expenses.reduce((s, e) => s + e.amount_paise, 0);
  const myShare = expenses.reduce((s, e) => s + (e.shares.find((sh) => sh.user_id === me?.id)?.owed_paise ?? 0), 0);
  const sharePct = total > 0 ? Math.round((myShare / total) * 100) : 0;
  const myDebts = balances?.simplified_settlements.filter((s) => s.from_user === me?.id) ?? [];
  const topDebt = myDebts.slice().sort((a, b) => b.amount_paise - a.amount_paise)[0];
  const [nudged, setNudged] = useState(false);

  async function nudge() {
    if (!turn) return;
    const who = name(turn.next_payer.user_id);
    const msg = `Hey ${who}, it's your turn to pay next in “${group?.name ?? 'our group'}” on Squared Up. ${turn.reason}.`;
    const out = await shareText(msg, 'Turn to Pay');
    if (out !== 'failed') { setNudged(true); setTimeout(() => setNudged(false), 2000); }
  }

  return (
    <div className="min-h-screen pb-28 bg-paper">
      <header className="bg-paper sticky top-0 z-40 flex items-center justify-between px-mobile py-3">
        <button onClick={() => nav(-1)} className="w-10 h-10 flex items-center justify-center text-primary active:scale-95 transition-transform">
          <Icon name="arrow_back" />
        </button>
        <h1 className="font-heading text-[22px] font-bold text-primary">{group?.name ?? 'Group'}</h1>
        <button onClick={() => nav(`/groups/${groupId}/settings`)} className="w-10 h-10 flex items-center justify-center text-primary active:scale-95 transition-transform">
          <Icon name="settings" />
        </button>
      </header>

      <main className="px-mobile flex flex-col gap-5">
        {/* Turn to Pay */}
        {turn && (
          <div className="bg-primary/10 rounded-card p-4 flex items-center gap-3">
            <Avatar name={name(turn.next_payer.user_id)} size={48} />
            <div className="flex-1 min-w-0">
              <p className="font-heading text-[17px] font-semibold text-ink">Turn to Pay</p>
              <p className="font-body text-[13px] text-on-surface-variant leading-snug">{turn.reason}</p>
            </div>
            <button onClick={nudge} className="px-4 h-9 rounded-button bg-surface-container-lowest border border-neutral-300 text-primary font-body text-[15px] font-medium active:scale-95 transition-transform">
              {nudged ? 'Sent' : 'Nudge'}
            </button>
          </div>
        )}

        {/* Your Total Balance */}
        <section className="bg-surface-container-lowest rounded-card p-6 border border-neutral-300 card-shadow flex flex-col items-center text-center gap-1">
          <span className="font-heading text-[22px] text-ink">Your Total Balance</span>
          <span className={`font-heading text-[40px] leading-tight font-semibold tnum ${owe ? 'text-primary' : 'text-success'}`}>
            {owe ? '-' : ''}{rupees(Math.abs(myNet))}
          </span>
          <span className="font-body text-[15px] text-on-surface-variant">{owe ? 'You owe the group' : 'The group owes you'}</span>
          <button onClick={() => nav(`/groups/${groupId}/summary`)} className="font-body text-[15px] text-primary font-semibold mt-1">View Summary</button>
        </section>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-surface-container-lowest rounded-card p-4 border border-neutral-300 card-shadow flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-ink">
              <Icon name="calendar_month" style={{ fontSize: 20 }} />
              <span className="font-body text-[15px]">This Month</span>
            </div>
            <span className="font-heading text-[22px] font-semibold text-ink tnum">{rupees0(total)}</span>
            <span className="font-caption text-caption text-neutral-600">Total group spend</span>
          </div>
          <div className="bg-surface-container-lowest rounded-card p-4 border border-neutral-300 card-shadow flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-ink">
              <Icon name="pie_chart" style={{ fontSize: 20 }} />
              <span className="font-body text-[15px]">Your Share</span>
            </div>
            <span className="font-heading text-[22px] font-semibold text-ink tnum">{rupees0(myShare)}</span>
            <span className="font-caption text-caption text-neutral-600">{sharePct}% of total</span>
          </div>
        </div>

        {/* Recent Activity */}
        <section className="flex flex-col gap-3">
          <h3 className="font-heading text-[22px] font-bold text-ink">Recent Activity</h3>
          <div className="flex flex-col gap-3">
            {expenses.map((e) => {
              const cat = categoryFor(e.description);
              const payer = e.shares.find((s) => s.paid_paise > 0);
              const iPaid = payer?.user_id === me?.id;
              const net = e.shares.find((s) => s.user_id === me?.id)?.net_paise ?? 0;
              return (
                <Link key={e.id} to={`/expense/${e.id}`} state={{ group: group?.name }} className="bg-surface-container-lowest rounded-card p-4 border border-neutral-300 card-shadow flex items-center justify-between active:scale-[0.99] transition-transform">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-button bg-surface-container-high flex items-center justify-center text-ink shrink-0">
                      <Icon name={cat.icon} style={{ fontSize: 22 }} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-heading text-[17px] font-semibold text-ink truncate">{e.description}</span>
                      <span className="font-caption text-caption text-neutral-600 truncate">{iPaid ? 'You paid' : `Paid by ${payer ? name(payer.user_id) : '—'}`}</span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0 pl-2">
                    <span className="font-currency text-[17px] font-medium text-ink tnum">{rupees0(e.amount_paise)}</span>
                    <span className={`text-[11px] font-medium ${net > 0 ? 'text-success' : net < 0 ? 'text-primary' : 'text-neutral-600'}`}>
                      {net > 0 ? `Lent ${rupees0(net)}` : net < 0 ? `You owe ${rupees0(-net)}` : 'Settled'}
                    </span>
                  </div>
                </Link>
              );
            })}
            {expenses.length === 0 && <p className="text-neutral-600 font-body text-[15px] py-4 text-center">No expenses yet.</p>}
          </div>
        </section>
      </main>

      {/* Settle Up bar */}
      <div className="fixed bottom-0 left-0 right-0 max-w-[28rem] mx-auto px-mobile pb-5 pt-3 bg-gradient-to-t from-paper via-paper to-transparent">
        <button
          onClick={() => topDebt ? nav(`/settle/${groupId}/${topDebt.to_user}`) : nav(`/groups/${groupId}/add`)}
          className="w-full h-[52px] bg-primary text-on-primary rounded-button font-heading text-[17px] font-semibold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
        >
          {topDebt ? 'Settle Up' : 'Add Expense'}
          <Icon name={topDebt ? 'payments' : 'add'} style={{ fontSize: 22 }} />
        </button>
      </div>
    </div>
  );
}
