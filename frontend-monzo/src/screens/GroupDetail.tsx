import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiClient, type Balances, type Expense, type Group, type Turn } from '../api.js';
import { useStore } from '../store.js';
import { rupees, rupees0 } from '../format.js';
import { Avatar, Icon, categoryStyle } from '../ui.js';
import { PageBanner } from '../banners.js';
import { shareText } from '../share.js';
import { useDataChanged } from '../dataEvents.js';

export function GroupDetail() {
  const { id } = useParams();
  const groupId = Number(id);
  const { me, name } = useStore();
  const nav = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  // null = still loading, so the empty state can't flash before the fetch lands.
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [turn, setTurn] = useState<Turn | null>(null);

  const bump = useDataChanged();
  const reload = useCallback(() => {
    apiClient.group(groupId).then(setGroup).catch(() => {});
    apiClient.balances(groupId).then(setBalances).catch(() => {});
    apiClient.expenses(groupId).then(setExpenses).catch(() => {});
    apiClient.turn(groupId).then(setTurn).catch(() => setTurn(null));
    // bump: refetch when an Undo toast (or similar) mutates data behind this screen.
  }, [groupId, bump]);
  useEffect(reload, [reload]);

  const exps = expenses ?? [];
  const empty = expenses !== null && expenses.length === 0;
  const myNet = balances?.members.find((m) => m.user_id === me?.id)?.net_paise ?? 0;
  const owe = myNet < 0;
  // "This month" really means this calendar month, over the full expense list.
  const monthKey = new Date().toISOString().slice(0, 7);
  const thisMonth = exps.filter((e) => (e.expense_date ?? e.created_at).slice(0, 7) === monthKey);
  const total = thisMonth.reduce((s, e) => s + e.amount_paise, 0);
  const myShare = thisMonth.reduce((s, e) => s + (e.shares.find((sh) => sh.user_id === me?.id)?.owed_paise ?? 0), 0);
  const sharePct = total > 0 ? Math.round((myShare / total) * 100) : 0;
  const recent = exps.slice(0, 8);
  const archived = !!group?.archived_at;
  // Personal tracker: solo group — nets/debts are always zero, so the hero
  // shows what was spent instead of who-owes-who.
  const personal = group?.type === 'personal';
  const myDebts = balances?.simplified_settlements.filter((s) => s.from_user === me?.id) ?? [];
  const topDebt = !archived ? myDebts.slice().sort((a, b) => b.amount_paise - a.amount_paise)[0] : undefined;
  const [nudged, setNudged] = useState(false);

  async function nudge() {
    if (!turn) return;
    const who = name(turn.next_payer.user_id);
    const msg = `Hey ${who}, it's your turn to pay next in “${group?.name ?? 'our group'}” on Squared Up. ${turn.reason}.`;
    const out = await shareText(msg, 'Turn to Pay');
    if (out !== 'failed') { setNudged(true); setTimeout(() => setNudged(false), 2000); }
  }

  return (
    <div className={`min-h-screen bg-paper ${archived ? 'pb-10' : topDebt ? 'pb-44' : 'pb-28'}`}>
      <PageBanner
        title={group?.name ?? 'Group'}
        sub={group ? (personal ? 'Personal tracker' : `${group.members.length} members${group.rotation_enabled ? ' · Turn to Pay' : ''}`) : undefined}
        action={
          <button onClick={() => nav(`/groups/${groupId}/settings`)} aria-label="Settings" className="w-10 h-10 flex items-center justify-center active:scale-95 transition-transform">
            <Icon name="settings" style={{ fontSize: 22 }} />
          </button>
        }
      />

      <main className="monzo-sheet mx-3 -mt-9 px-6 pb-8">
        <span className="sheet-handle" />

        {archived && (
          <div className="bg-surface-container-high rounded-card p-3 mt-8 flex items-center gap-2 text-neutral-600">
            <Icon name="inventory_2" style={{ fontSize: 20 }} />
            <span className="font-body text-[13px] font-semibold">This group is archived. It's read-only — restore it from Settings to add expenses.</span>
          </div>
        )}

        {/* Brand-new group: skip the zeroed hero/tiles and point at the one
            action that makes the screen come alive. */}
        {empty && !archived ? (
          <section className="flex flex-col items-center text-center gap-3 pt-14 pb-10 px-6">
            <div className="w-16 h-16 rounded-card bg-primary/10 text-primary flex items-center justify-center">
              <Icon name="receipt_long" fill style={{ fontSize: 30 }} />
            </div>
            <h2 className="font-heading text-[21px] font-extrabold text-ink">Add an expense to start</h2>
            <p className="font-body text-[14.5px] font-semibold text-neutral-600 max-w-[260px] leading-snug">
              Log the first bill and Squared Up starts tracking who owes who.
            </p>
          </section>
        ) : (
        <>
        {/* Your balance with this group — the hero number, Monzo donut-center style.
            A personal tracker has no who-owes-who: the hero is your spend. */}
        <section className="flex flex-col items-center text-center pt-9">
          <span className={`font-heading text-[40px] leading-tight font-extrabold tracking-[-1.5px] tnum ${!personal && owe ? 'text-primary' : 'text-ink'}`}>
            {personal ? rupees(total) : `${owe ? '-' : ''}${rupees(Math.abs(myNet))}`}
          </span>
          <span className="font-body text-[15px] font-semibold text-neutral-600">
            {personal ? 'Spent this month' : owe ? 'You owe the group' : 'The group owes you'}
          </span>
          {!personal && (
            <button onClick={() => nav(`/groups/${groupId}/summary`)} className="font-body text-[14px] text-primary font-bold mt-2 active:scale-95 transition-transform">
              View summary
            </button>
          )}
        </section>

        {/* Turn to Pay */}
        {!archived && turn && (
          <div className="flex items-center gap-3 mt-7">
            <Avatar name={name(turn.next_payer.user_id)} size={49} />
            <div className="flex-1 min-w-0">
              <p className="font-body text-[16px] font-bold text-ink">Turn to Pay</p>
              <p className="font-body text-[12.5px] font-semibold text-neutral-600 leading-snug">{turn.reason}</p>
            </div>
            <button onClick={nudge} className="px-5 h-10 rounded-full bg-surface shadow-soft text-primary font-body text-[14px] font-bold active:scale-95 transition-transform shrink-0">
              {nudged ? 'Sent' : 'Nudge'}
            </button>
          </div>
        )}

        {/* Stat tiles — Monzo service-tile treatment */}
        <div className="grid grid-cols-2 gap-4 mt-7">
          <div className="rounded-card bg-[#7dc38e] shadow-tile-green p-4 flex flex-col gap-0.5 text-white">
            <span className="font-body text-[12px] font-bold text-white/85">This month</span>
            <span className="font-heading text-[22px] font-extrabold tnum">{rupees0(total)}</span>
            <span className="text-[11px] font-semibold text-white/85">{personal ? 'Total spend' : 'Total group spend'}</span>
          </div>
          <div className="rounded-card bg-[#1e738d] shadow-tile-teal p-4 flex flex-col gap-0.5 text-white">
            {personal ? (<>
              <span className="font-body text-[12px] font-bold text-white/85">Expenses</span>
              <span className="font-heading text-[22px] font-extrabold tnum">{thisMonth.length}</span>
              <span className="text-[11px] font-semibold text-white/85">logged this month</span>
            </>) : (<>
              <span className="font-body text-[12px] font-bold text-white/85">Your share</span>
              <span className="font-heading text-[22px] font-extrabold tnum">{rupees0(myShare)}</span>
              <span className="text-[11px] font-semibold text-white/85">{sharePct}% of total</span>
            </>)}
          </div>
        </div>

        {/* Recent Activity */}
        <section className="mt-8">
          <div className="flex items-baseline justify-between">
            <h3 className="font-body text-[16px] font-semibold text-neutral-600">Recent activity</h3>
            {exps.length > 8 && (
              <Link to={`/groups/${groupId}/expenses`} className="font-body text-[13px] font-semibold text-outline">View all</Link>
            )}
          </div>
          <div className="flex flex-col gap-4 mt-4">
            {recent.map((e) => {
              const cat = categoryStyle(e.category, e.description);
              const payer = e.shares.find((s) => s.paid_paise > 0);
              const iPaid = payer?.user_id === me?.id;
              const net = e.shares.find((s) => s.user_id === me?.id)?.net_paise ?? 0;
              return (
                <Link key={e.id} to={`/expense/${e.id}`} state={{ group: group?.name }} className="flex items-center gap-3 active:scale-[0.98] transition-transform">
                  <span className="w-[49px] h-[49px] shrink-0 rounded-xl bg-surface shadow-soft flex items-center justify-center text-primary">
                    <Icon name={cat.icon} style={{ fontSize: 26 }} />
                  </span>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-body text-[16px] font-bold text-ink truncate">{e.description}</span>
                    <span className="font-body text-[12.5px] font-semibold text-neutral-600 truncate">
                      {iPaid ? 'You paid' : `Paid by ${payer ? name(payer.user_id) : '—'}`} {rupees0(e.amount_paise)}
                    </span>
                  </div>
                  <span className={`font-body text-[16px] font-extrabold tnum shrink-0 ${net > 0 ? 'text-teal' : net < 0 ? 'text-primary' : 'text-neutral-600'}`}>
                    {net > 0 ? `+${rupees0(net)}` : net < 0 ? `-${rupees0(-net)}` : '—'}
                  </span>
                </Link>
              );
            })}
            {empty && <p className="text-neutral-600 font-body text-[15px] py-4 text-center">No expenses yet.</p>}
          </div>
        </section>
        </>
        )}
      </main>

      {/* Action bar — hidden for archived (read-only) groups */}
      {!archived && (
      // z-10: must sit above the monzo-sheet (z-1) or its content eats taps
      <div className="fixed bottom-0 left-0 right-0 z-10 max-w-[28rem] mx-auto px-6 pb-5 pt-3 safe-bottom bg-gradient-to-t from-paper via-paper to-transparent flex flex-col gap-2.5">
        {topDebt && (
          <button
            onClick={() => nav(`/settle/${groupId}/${topDebt.to_user}`)}
            className="w-full h-[52px] bg-surface text-primary shadow-soft rounded-full font-heading text-[17px] font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform"
          >
            Square up
            <Icon name="payments" style={{ fontSize: 22 }} />
          </button>
        )}
        <button onClick={() => nav(`/groups/${groupId}/add`)} className="btn-coral justify-center gap-2 text-[17px]">
          Add Expense
          <Icon name="add" style={{ fontSize: 22 }} />
        </button>
      </div>
      )}
    </div>
  );
}
