import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient, type Balances, type Expense } from '../api.js';
import { useStore } from '../store.js';
import { rupees } from '../format.js';
import { Avatar, Icon, categoryFor, groupTypeStyle, useCountUp } from '../ui.js';
import { shareText } from '../share.js';

export function Home() {
  const { me, groups, name } = useStore();
  const nav = useNavigate();
  const [balByGroup, setBalByGroup] = useState<Record<number, Balances>>({});
  const [expenses, setExpenses] = useState<(Expense & { _group: string })[] | null>(null);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    Promise.all(groups.map((g) => apiClient.balances(g.id).catch(() => null))).then((rows) => {
      if (cancelled) return;
      const map: Record<number, Balances> = {};
      rows.forEach((b, i) => { const g = groups[i]; if (b && g) map[g.id] = b; });
      setBalByGroup(map);
    });
    Promise.all(
      groups.map((g) => apiClient.expenses(g.id).then((es) => es.map((e) => ({ ...e, _group: g.name })) ).catch(() => [])),
    ).then((lists) => {
      if (cancelled) return;
      const merged = lists.flat().sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 6);
      setExpenses(merged);
    });
    return () => { cancelled = true; };
  }, [me, groups]);

  const firstName = (me?.name ?? '').trim().split(/\s+/)[0] || 'there';

  const myNet = (gid: number) => balByGroup[gid]?.members.find((m) => m.user_id === me?.id)?.net_paise ?? 0;
  const overall = useMemo(
    () => groups.reduce((s, g) => s + myNet(gid(g)), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [balByGroup, groups, me],
  );
  const owed = overall >= 0;
  const animatedOverall = useCountUp(overall);
  const [remindMsg, setRemindMsg] = useState<string | null>(null);

  async function remind() {
    // Everyone who owes me, summed across groups (from simplified settlements).
    const byDebtor = new Map<number, number>();
    for (const g of groups) {
      const b = balByGroup[g.id];
      if (!b) continue;
      for (const s of b.simplified_settlements) {
        if (s.to_user === me?.id) byDebtor.set(s.from_user, (byDebtor.get(s.from_user) ?? 0) + s.amount_paise);
      }
    }
    if (byDebtor.size === 0) {
      setRemindMsg('No one owes you right now.');
      setTimeout(() => setRemindMsg(null), 2500);
      return;
    }
    const lines = [...byDebtor.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([uid, paise]) => `• ${name(uid)}: ${rupees(paise)}`);
    const vpa = me?.upi_vpa ? `\nPay me on UPI: ${me.upi_vpa}` : '';
    const msg = `Friendly reminder from Squared Up — here's what's still owed to me:\n${lines.join('\n')}${vpa}`;
    const out = await shareText(msg, 'Payment reminder');
    if (out === 'copied') { setRemindMsg('Reminder copied to clipboard'); setTimeout(() => setRemindMsg(null), 2500); }
  }

  return (
    <div className="min-h-screen pb-28 bg-paper">
      {/* Top App Bar */}
      <header className="bg-paper sticky top-0 z-40 flex items-center justify-between px-mobile py-3">
        <Link to="/profile" className="flex items-center gap-3 min-w-0 active:scale-[0.98] transition-transform">
          <Avatar name={me?.name ?? ''} size={40} />
          <div className="flex flex-col min-w-0">
            <span className="font-heading text-[17px] font-bold text-ink leading-tight truncate">Hi {firstName} 👋</span>
            <span className="font-caption text-caption text-neutral-600">
              {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
            </span>
          </div>
        </Link>
        <Link to="/activity" className="w-10 h-10 flex items-center justify-center rounded-full text-primary active:scale-95 transition-transform">
          <Icon name="notifications" />
        </Link>
      </header>

      <main className="px-mobile flex flex-col gap-6 stagger">
        {groups.length === 0 && (
          <section className="bg-surface-container-lowest rounded-card p-6 border border-neutral-300 card-shadow flex flex-col items-center text-center gap-3">
            <div className="w-14 h-14 rounded-card bg-primary/10 text-primary flex items-center justify-center">
              <Icon name="group_add" fill style={{ fontSize: 28 }} />
            </div>
            <h2 className="font-heading text-[22px] font-bold text-ink">Start your first group</h2>
            <p className="font-body text-[15px] text-on-surface-variant max-w-[280px]">
              Flatmates, a trip, or just you and a friend — add expenses and Squared Up keeps the math fair.
            </p>
            <button
              onClick={() => nav('/groups/new')}
              className="w-full bg-primary text-on-primary h-[52px] rounded-button font-heading text-[17px] font-semibold mt-1 active:scale-[0.98] transition-transform"
            >
              Create a group
            </button>
          </section>
        )}
        {/* Hero Balance */}
        {groups.length > 0 && (
        <section className="bg-surface-container-lowest rounded-card p-4 border border-neutral-300 card-shadow flex flex-col gap-3">
          <div className="flex justify-between items-start">
            <div className="flex flex-col">
              <span className="font-body text-[15px] text-neutral-600">Overall Balance</span>
              <h2 className="font-heading text-[40px] leading-tight font-semibold text-ink tnum mt-1">
                {rupees(Math.abs(animatedOverall))}
              </h2>
            </div>
            <div className={`px-3 py-0.5 rounded-full flex items-center gap-1 ${owed ? 'bg-teal/10 text-teal' : 'bg-primary/10 text-primary'}`}>
              <Icon name={overall === 0 ? 'check' : owed ? 'arrow_upward' : 'arrow_downward'} fill style={{ fontSize: 16 }} />
              <span className="text-[11px] font-medium">{overall === 0 ? 'All settled' : owed ? 'You are owed' : 'You owe'}</span>
            </div>
          </div>
          <div className="flex gap-4 mt-1">
            <button
              onClick={() => nav('/groups')}
              className="flex-1 bg-primary text-on-primary h-[52px] rounded-button font-heading text-[17px] font-semibold active:scale-95 transition-transform"
            >
              Settle Up
            </button>
            <button
              onClick={remind}
              className="flex-1 border border-neutral-900 text-ink h-[52px] rounded-button font-heading text-[17px] font-semibold active:scale-95 transition-transform"
            >
              Remind
            </button>
          </div>
          {remindMsg && <p className="font-caption text-caption text-neutral-600 text-center">{remindMsg}</p>}
        </section>
        )}

        {/* Active Groups */}
        <section className="flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h3 className="font-heading text-[22px] font-semibold text-ink">Active Groups</h3>
            <Link to="/groups" className="font-body text-[15px] text-primary font-medium">View All</Link>
          </div>
          <div className="flex gap-4 overflow-x-auto hide-scrollbar pb-1 -mx-mobile px-mobile">
            {groups.map((g) => {
              const st = groupTypeStyle(g.type);
              const net = myNet(g.id);
              return (
                <button
                  key={g.id}
                  onClick={() => nav(`/groups/${g.id}`)}
                  className="text-left min-w-[200px] shrink-0 bg-surface-container-lowest rounded-card p-4 border border-neutral-300 card-shadow flex flex-col gap-4 active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-button flex items-center justify-center ${st.tint} ${st.fg}`}>
                      <Icon name={st.icon} fill style={{ fontSize: 22 }} />
                    </div>
                    <div className="flex flex-col">
                      <span className="font-heading text-[17px] font-semibold text-ink leading-tight">{g.name}</span>
                      <span className="text-[11px] text-neutral-600">{g.members.length} members</span>
                    </div>
                  </div>
                  <div>
                    <span className="font-caption text-caption text-neutral-600 block mb-0.5">{net >= 0 ? 'You are owed' : 'You owe'}</span>
                    <span className={`font-currency text-[17px] font-semibold tnum ${net >= 0 ? 'text-success' : 'text-primary'}`}>
                      {net >= 0 ? '+' : '-'}{rupees(Math.abs(net))}
                    </span>
                  </div>
                </button>
              );
            })}
            <button
              onClick={() => nav('/groups/new')}
              className="min-w-[160px] shrink-0 bg-surface-container border border-dashed border-neutral-300 rounded-card p-4 flex flex-col items-center justify-center gap-2 text-neutral-600 active:scale-[0.98] transition-transform"
            >
              <div className="w-10 h-10 rounded-button bg-neutral-100 flex items-center justify-center">
                <Icon name="add" />
              </div>
              <span className="font-body text-[15px] font-medium">New Group</span>
            </button>
          </div>
        </section>

        {/* Recent Activity */}
        <section className="flex flex-col gap-3 pb-6">
          <div className="flex justify-between items-center">
            <h3 className="font-heading text-[22px] font-semibold text-ink">Recent Activity</h3>
            <Link to="/activity" className="font-body text-[15px] text-primary font-medium">History</Link>
          </div>
          {expenses === null && (
            <div className="flex flex-col gap-3">
              {[0, 1, 2].map((i) => <div key={i} className="skeleton h-[72px] rounded-card" />)}
            </div>
          )}
          <div className={`bg-surface-container-lowest rounded-card border border-neutral-300 card-shadow divide-y divide-neutral-100 ${expenses === null ? 'hidden' : ''}`}>
            {(expenses ?? []).map((e) => {
              const cat = categoryFor(e.description);
              const payer = e.shares.find((s) => s.paid_paise > 0);
              const iPaid = payer?.user_id === me?.id;
              const myShare = e.shares.find((s) => s.user_id === me?.id);
              const net = myShare?.net_paise ?? 0;
              return (
                <Link key={e.id} to={`/expense/${e.id}`} state={{ group: e._group }} className="p-4 flex items-center justify-between active:bg-surface-container-low transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-button flex items-center justify-center shrink-0 ${cat.tint} ${cat.fg}`}>
                      <Icon name={cat.icon} fill style={{ fontSize: 22 }} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-heading text-[17px] font-semibold text-ink truncate">{e.description}</span>
                      <span className="font-caption text-caption text-neutral-600 truncate">
                        {e._group} • {iPaid ? 'You paid' : `Paid by ${payer ? name(payer.user_id) : '—'}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0 pl-2">
                    <span className="font-currency text-[17px] text-ink tnum">{rupees(e.amount_paise)}</span>
                    <span className={`text-[11px] font-medium ${net > 0 ? 'text-success' : net < 0 ? 'text-primary' : 'text-neutral-600'}`}>
                      {net > 0 ? `Lent ${rupees(net)}` : net < 0 ? `Borrowed ${rupees(-net)}` : 'Settled'}
                    </span>
                  </div>
                </Link>
              );
            })}
            {expenses !== null && expenses.length === 0 && (
              <div className="p-8 flex flex-col items-center gap-2 text-neutral-600">
                <Icon name="receipt_long" style={{ fontSize: 28 }} />
                <p className="font-body text-[15px] text-center">No expenses yet — add your first one with the + button.</p>
              </div>
            )}
          </div>
        </section>
      </main>

      {/* FAB — pinned to the phone-width column, not the viewport */}
      <div className="fixed bottom-24 inset-x-0 max-w-[28rem] mx-auto px-mobile flex justify-end pointer-events-none z-40">
        <button
          onClick={() => nav(groups[0] ? `/groups/${groups[0].id}/add` : '/groups/new')}
          className="pointer-events-auto w-14 h-14 bg-primary text-on-primary rounded-card flex items-center justify-center active:scale-90 transition-transform"
          style={{ boxShadow: '0 6px 16px rgba(181,35,48,0.35)' }}
        >
          <Icon name="add" style={{ fontSize: 28 }} />
        </button>
      </div>
    </div>
  );
}

function gid(g: { id: number }) { return g.id; }
