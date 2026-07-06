import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient, type User } from '../api.js';
import { useStore } from '../store.js';
import { rupees } from '../format.js';
import { Avatar, Icon } from '../ui.js';

export function Friends() {
  const nav = useNavigate();
  const { me, groups } = useStore();
  const [friends, setFriends] = useState<User[]>([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  // person id → net paise from my point of view (+ they owe me, − I owe them)
  const [nets, setNets] = useState<Map<number, number>>(new Map());
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const load = () => apiClient.friends().then(setFriends).catch(() => {});
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    Promise.all(groups.map((g) => apiClient.balances(g.id).catch(() => null))).then((rows) => {
      if (cancelled) return;
      const m = new Map<number, number>();
      for (const b of rows) {
        for (const s of b?.simplified_settlements ?? []) {
          if (s.from_user === me.id) m.set(s.to_user, (m.get(s.to_user) ?? 0) - s.amount_paise);
          if (s.to_user === me.id) m.set(s.from_user, (m.get(s.from_user) ?? 0) + s.amount_paise);
        }
      }
      setNets(m);
    });
    return () => { cancelled = true; };
  }, [me, groups]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    timer.current = setTimeout(() => {
      apiClient.searchUsers(q.trim())
        .then((r) => setResults(r.filter((u) => u.id !== me?.id)))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q, me]);

  const friendIds = new Set(friends.map((f) => f.id));

  async function add(u: User) {
    try { const r = await apiClient.addFriend(u.id); setFriends(r.friends); }
    catch { /* surfaced by list not updating */ }
  }

  return (
    <div className="min-h-screen pb-10 bg-paper">
      <header className="flex items-center justify-between px-mobile py-3">
        <button onClick={() => nav(-1)} className="w-10 h-10 flex items-center justify-center text-primary active:scale-95 transition-transform">
          <Icon name="arrow_back" />
        </button>
        <h1 className="font-heading text-[22px] font-bold text-primary">Friends</h1>
        <div className="w-10" />
      </header>

      <main className="px-mobile flex flex-col gap-4">
        <div className="relative">
          <Icon name="search" className="text-neutral-600 absolute left-4 top-1/2 -translate-y-1/2" style={{ fontSize: 22 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} className="input-warm pl-12" placeholder="Search by name or phone" />
        </div>

        {q.trim().length >= 2 ? (
          <div className="flex flex-col gap-3">
            <h3 className="font-caption text-caption text-on-surface-variant">{searching ? 'Searching…' : 'Results'}</h3>
            {results.map((u) => (
              <Row key={u.id} u={u}>
                {friendIds.has(u.id) ? (
                  <span className="font-caption text-caption text-tertiary flex items-center gap-1"><Icon name="check" style={{ fontSize: 18 }} />Friends</span>
                ) : (
                  <button onClick={() => add(u)} className="px-4 h-9 rounded-button bg-primary text-on-primary font-body text-[15px] font-medium active:scale-95 transition-transform">Add</button>
                )}
              </Row>
            ))}
            {!searching && results.length === 0 && <Empty icon="person_search" text="No one found by that name or number." />}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <h3 className="font-caption text-caption text-on-surface-variant">Your friends</h3>
            {friends.map((u) => {
              const net = nets.get(u.id) ?? 0;
              return (
                <Row key={u.id} u={u}>
                  {net === 0 ? (
                    <span className="font-caption text-caption text-neutral-600">Settled</span>
                  ) : (
                    <div className="flex flex-col items-end">
                      <span className={`font-currency text-[15px] font-semibold tnum ${net > 0 ? 'text-success' : 'text-primary'}`}>
                        {net > 0 ? '+' : '-'}{rupees(Math.abs(net))}
                      </span>
                      <span className="font-caption text-caption text-neutral-600">{net > 0 ? 'owes you' : 'you owe'}</span>
                    </div>
                  )}
                </Row>
              );
            })}
            {friends.length === 0 && <Empty icon="group_add" text="No friends yet. Search above to add people you split with." />}
          </div>
        )}
      </main>
    </div>
  );
}

function Row({ u, children }: { u: User; children: React.ReactNode }) {
  return (
    <div className="bg-surface-container-lowest rounded-card p-3 border border-neutral-300 card-shadow flex items-center gap-3">
      <Avatar name={u.name || u.phone || '?'} size={44} />
      <div className="flex flex-col flex-1 min-w-0">
        <span className="font-heading text-[17px] font-semibold text-ink truncate">{u.name || 'Unnamed'}</span>
        <span className="font-caption text-caption text-neutral-600 truncate tnum">{u.phone ?? u.upi_vpa ?? ''}</span>
      </div>
      {children}
    </div>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="border border-dashed border-neutral-300 rounded-card py-10 flex flex-col items-center gap-2 text-neutral-600">
      <Icon name={icon} style={{ fontSize: 28 }} />
      <p className="font-body text-[15px] text-center max-w-[260px]">{text}</p>
    </div>
  );
}
