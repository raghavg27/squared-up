import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient, type ActivityEvent, type Balances, type User } from '../api.js';
import { useStore } from '../store.js';
import { rupees, rupees0 } from '../format.js';
import { Avatar, Icon, groupTypeStyle } from '../ui.js';
import { CoralBanner } from '../banners.js';
import { useDataChanged } from '../dataEvents.js';
import { ActivityRow, renderActivity } from '../activityRows.js';
import { BalanceDonut } from './BalanceDonut.js';
import { SquareUpMoves } from './SquareUpMoves.js';

// Groups render as Monzo "service tiles": solid colored squares with white
// icons, cycling through the concept's tile colors.
const TILE_TONES = [
  { bg: '#7dc38e' },
  { bg: '#ff4d56' },
  { bg: '#1e738d' },
];

export function Home() {
  const { me, groups, name } = useStore();
  const nav = useNavigate();
  const [balByGroup, setBalByGroup] = useState<Record<number, Balances>>({});
  const [personalNets, setPersonalNets] = useState<{ user_id: number; net_paise: number }[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  // null = still loading, so the empty state can't flash before the fetch lands.
  const [events, setEvents] = useState<ActivityEvent[] | null>(null);

  const bump = useDataChanged(); // refetch when an Undo toast mutates data behind this screen
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    apiClient.personalBalances()
      .then((b) => { if (!cancelled) setPersonalNets(b.counterparties); })
      .catch(() => { if (!cancelled) setPersonalNets([]); });
    Promise.all(groups.map((g) => apiClient.balances(g.id).catch(() => null))).then((rows) => {
      if (cancelled) return;
      const map: Record<number, Balances> = {};
      rows.forEach((b, i) => { const g = groups[i]; if (b && g) map[g.id] = b; });
      setBalByGroup(map);
    });
    apiClient.friends().then((f) => { if (!cancelled) setFriends(f); }).catch(() => {});
    apiClient.activity()
      .then((a) => { if (!cancelled) setEvents(a); })
      .catch(() => { if (!cancelled) setEvents([]); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, groups, bump]);

  const firstName = (me?.name ?? '').trim().split(/\s+/)[0] || 'there';

  // Per-person net across every group + personal splits. + they owe me, − I owe.
  // Each "pay" entry also carries the single largest debt source to settle first.
  const moves = useMemo(() => {
    const net = new Map<number, number>();
    const oweSrc = new Map<number, { path: string; amount: number }>();
    const bump = (uid: number, delta: number) => net.set(uid, (net.get(uid) ?? 0) + delta);
    const owe = (uid: number, path: string, amount: number) => {
      const cur = oweSrc.get(uid);
      if (!cur || amount > cur.amount) oweSrc.set(uid, { path, amount });
    };
    for (const g of groups) {
      for (const s of balByGroup[g.id]?.simplified_settlements ?? []) {
        if (s.from_user === me?.id) { bump(s.to_user, -s.amount_paise); owe(s.to_user, `/settle/${g.id}/${s.to_user}`, s.amount_paise); }
        if (s.to_user === me?.id) bump(s.from_user, s.amount_paise);
      }
    }
    for (const c of personalNets) {
      bump(c.user_id, c.net_paise);
      if (c.net_paise < 0) owe(c.user_id, `/settle/personal/${c.user_id}`, -c.net_paise);
    }
    const gets = [...net.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const pays = [...net.entries()].filter(([, n]) => n < 0).sort((a, b) => a[1] - b[1]);
    return { net, gets, pays, oweSrc };
  }, [balByGroup, personalNets, groups, me]);

  // Friend cards mirror group cards: everyone on the friends list (group
  // co-members are auto-friended server-side), outstanding balances first.
  const friendCards = useMemo(
    () =>
      friends
        .map((u) => ({ id: u.id, net: moves.net.get(u.id) ?? 0 }))
        .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || name(a.id).localeCompare(name(b.id))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [friends, moves],
  );

  const owedTotal = useMemo(() => moves.gets.reduce((s, [, n]) => s + n, 0), [moves]);
  const oweTotal = useMemo(() => moves.pays.reduce((s, [, n]) => s - n, 0), [moves]);

  const groupName = (gid: unknown) => (typeof gid === 'number' ? groups.find((g) => g.id === gid)?.name : undefined);
  const recentEvents = (events ?? []).slice(0, 6);

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' });

  return (
    <div className="min-h-screen pb-28 bg-paper">
      <CoralBanner title={`Hi ${firstName}`} sub={today} />

      {/* White sheet pulled up over the banner, Monzo "Balance" style. */}
      <main className="monzo-sheet mx-3 -mt-9 px-0 pb-10">
        <span className="sheet-handle" />

        {groups.length === 0 && friendCards.length === 0 ? (
          <section className="px-6 pt-10 pb-6 flex flex-col items-center text-center gap-3">
            <div className="w-16 h-16 rounded-card bg-primary/10 text-primary flex items-center justify-center">
              <Icon name="group_add" fill style={{ fontSize: 30 }} />
            </div>
            <h2 className="font-heading text-[22px] font-extrabold text-ink">Start your first group</h2>
            <p className="font-body text-[15px] text-on-surface-variant max-w-[280px]">
              Flatmates, a trip, or just you and a friend — add expenses and Squared Up keeps the math fair.
            </p>
            <button onClick={() => nav('/groups/new')} className="btn-coral mt-3 justify-center">
              Create a group
            </button>
          </section>
        ) : (
          <>
            {/* Hero: the balance donut */}
            <section className="pt-9">
              <BalanceDonut owedPaise={owedTotal} owePaise={oweTotal} />
              <div className="flex justify-center gap-5 mt-3">
                <span className="flex items-center gap-1.5 font-body text-[13px] font-semibold text-neutral-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-teal inline-block" />Owed to you {rupees0(owedTotal)}
                </span>
                <span className="flex items-center gap-1.5 font-body text-[13px] font-semibold text-neutral-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-danger inline-block" />You owe {rupees0(oweTotal)}
                </span>
              </div>
            </section>

            <SquareUpMoves moves={moves} />

            {/* Groups as Monzo service tiles */}
            <section className="mt-8">
              <div className="flex items-baseline justify-between px-6">
                <h3 className="font-body text-[16px] font-semibold text-neutral-600">Your groups</h3>
                <Link to="/groups" className="font-body text-[13px] font-semibold text-outline">View all</Link>
              </div>
              <div className="flex gap-4 overflow-x-auto hide-scrollbar mt-4 px-6">
                {groups.map((g, i) => {
                  const tone = TILE_TONES[i % TILE_TONES.length]!;
                  const st = groupTypeStyle(g.type);
                  const netP = balByGroup[g.id]?.members.find((m) => m.user_id === me?.id)?.net_paise ?? 0;
                  return (
                    <button
                      key={g.id}
                      onClick={() => nav(`/groups/${g.id}`)}
                      className="shrink-0 w-[104px] h-[104px] rounded-card flex flex-col items-center justify-center gap-1.5 text-white active:scale-[0.96] transition-transform"
                      style={{ background: tone.bg }}
                    >
                      <Icon name={st.icon} fill style={{ fontSize: 30 }} />
                      <span className="text-[11px] font-bold leading-tight max-w-[88px] truncate">{g.name}</span>
                      <span className="text-[11px] font-extrabold text-white/90 tnum">
                        {netP === 0 ? '—' : `${netP > 0 ? '+' : '-'}${rupees(Math.abs(netP))}`}
                      </span>
                    </button>
                  );
                })}
                <button
                  onClick={() => nav('/groups/new')}
                  className="shrink-0 w-[104px] h-[104px] rounded-card border-2 border-dashed border-neutral-300 flex flex-col items-center justify-center gap-1.5 text-neutral-600 active:scale-[0.96] transition-transform"
                >
                  <Icon name="add" style={{ fontSize: 26 }} />
                  <span className="text-[11px] font-bold">New group</span>
                </button>
              </div>
            </section>

          </>
        )}
      </main>

      {/* Friends — everyone you split with (group co-members auto-friend).
          Own white sheet, same treatment as Recent activity, so it never
          merges into the group tiles above. */}
      {friendCards.length > 0 && (
        <section className="monzo-sheet mx-3 mt-5 px-6 pt-6 pb-7">
          <div className="flex items-baseline justify-between">
            <h3 className="font-body text-[16px] font-semibold text-neutral-600">Friends</h3>
            <Link to="/friends" className="font-body text-[13px] font-semibold text-outline">View all</Link>
          </div>
          <div className="flex flex-col gap-4 mt-4">
            {friendCards.slice(0, 4).map(({ id, net }) => (
              <button key={id} onClick={() => nav(`/friends/${id}`)} className="flex items-center gap-3 active:scale-[0.98] transition-transform">
                <Avatar name={name(id)} size={49} />
                <div className="flex flex-col flex-1 min-w-0 text-left">
                  <span className="font-body text-[16px] font-bold text-ink truncate">{name(id)}</span>
                  <span className="font-body text-[12.5px] font-semibold text-neutral-600">
                    {net === 0 ? 'Settled' : net > 0 ? 'Owes you' : 'You owe'}
                  </span>
                </div>
                <span className={`font-body text-[16px] font-extrabold tnum ${net > 0 ? 'text-teal' : net < 0 ? 'text-primary' : 'text-neutral-600'}`}>
                  {net === 0 ? '—' : `${net > 0 ? '+' : '-'}${rupees(Math.abs(net))}`}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Recent activity: the real event feed (adds, edits, deletions,
          comments, settlements, member changes) — same rows as /activity */}
      <section className="monzo-sheet mx-3 mt-5 px-6 pt-6 pb-7">
        <div className="flex items-baseline justify-between">
          <h3 className="font-body text-[16px] font-semibold text-neutral-600">Recent activity</h3>
          <Link to="/activity" className="font-body text-[13px] font-semibold text-outline">History</Link>
        </div>
        {events === null && (
          <div className="flex flex-col gap-4 mt-4">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-[49px] rounded-card" />)}
          </div>
        )}
        <div className="flex flex-col gap-4 mt-4">
          {recentEvents.map((e) => <ActivityRow key={e.id} r={renderActivity(e, name, me?.id, groupName)} />)}
          {events !== null && events.length === 0 && (
            <div className="py-6 flex flex-col items-center gap-2 text-neutral-600">
              <Icon name="receipt_long" style={{ fontSize: 28 }} />
              <p className="font-body text-[15px] text-center">Nothing yet — add your first expense with the + button.</p>
            </div>
          )}
        </div>
      </section>

      {/* FAB — pinned to the phone-width column, not the viewport */}
      <div className="fixed bottom-24 inset-x-0 max-w-[28rem] mx-auto px-mobile flex justify-end pointer-events-none z-40">
        <button
          onClick={() => nav('/add')}
          className="pointer-events-auto w-14 h-14 bg-primary text-on-primary rounded-full shadow-coral flex items-center justify-center active:scale-90 transition-transform"
        >
          <Icon name="add" style={{ fontSize: 28 }} />
        </button>
      </div>
    </div>
  );
}
