import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient, type User } from '../api.js';
import { useStore } from '../store.js';
import { useCached, writeCache } from '../cache.js';
import { friendlyError } from '../errors.js';
import { rupees } from '../format.js';
import { Avatar, Icon, InviteCard } from '../ui.js';
import { PageBanner } from '../banners.js';
import { RowSkeletons } from '../skeletons.js';
import { useToast } from '../toast.js';

export function Friends() {
  const nav = useNavigate();
  const { me, groups, reloadUsers } = useStore();
  const { showToast } = useToast();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  // Cached list mirrored into local state so add/remove can update it
  // optimistically before the server answers.
  const fr = useCached(me ? 'friends' : null, () => apiClient.friends());
  const [friends, setFriends] = useState<User[]>(fr.data ?? []);
  useEffect(() => { if (fr.data) setFriends(fr.data); }, [fr.data]);

  // person id → net paise from my point of view (+ they owe me, − I owe them)
  const ids = groups.map((g) => g.id).join(',');
  const nt = useCached(me ? `friend-nets:${ids}` : null, async () => {
    const [rows, personal] = await Promise.all([
      Promise.all(groups.map((g) => apiClient.balances(g.id).catch(() => null))),
      apiClient.personalBalances().catch(() => null),
    ]);
    const m = new Map<number, number>();
    for (const b of rows) {
      for (const s of b?.simplified_settlements ?? []) {
        if (s.from_user === me!.id) m.set(s.to_user, (m.get(s.to_user) ?? 0) - s.amount_paise);
        if (s.to_user === me!.id) m.set(s.from_user, (m.get(s.from_user) ?? 0) + s.amount_paise);
      }
    }
    for (const c of personal?.counterparties ?? []) m.set(c.user_id, (m.get(c.user_id) ?? 0) + c.net_paise);
    return m;
  });
  const nets = nt.data ?? new Map<number, number>();

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

  // Both mutations render optimistically — the list updates the instant you
  // tap — and roll back with a toast if the server disagrees.
  async function add(u: User) {
    const before = friends;
    setFriends((f) => (f.some((x) => x.id === u.id) ? f : [...f, u]));
    try {
      const r = await apiClient.addFriend(u.id);
      setFriends(r.friends);
      writeCache('friends', r.friends);
      // reloadUsers so the store's directory (and name()) learns a freshly-added
      // placeholder immediately — otherwise their FriendDetail shows "#<id>".
      reloadUsers();
    } catch (e) {
      setFriends(before);
      showToast(friendlyError(e, "Couldn't add them — try again."));
    }
  }

  async function unfriend(u: User) {
    if (!window.confirm(`Remove ${u.name || 'this person'} from your friends? Shared expenses and balances are kept.`)) return;
    const before = friends;
    setFriends((f) => f.filter((x) => x.id !== u.id));
    try {
      const r = await apiClient.removeFriend(u.id);
      setFriends(r.friends);
      writeCache('friends', r.friends);
    } catch (e) {
      setFriends(before);
      showToast(friendlyError(e, "Couldn't remove them — try again."));
    }
  }

  return (
    <div className="min-h-screen pb-10 bg-paper">
      <PageBanner title="Friends" sub="People you split with" />

      <main className="monzo-sheet mx-3 -mt-9 px-6 pb-8 flex flex-col gap-4">
        <span className="sheet-handle" />

        {/* Monzo search row: borderless, magnifier on the right */}
        <div className="mt-4">
          <div className="flex items-center gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="flex-1 bg-transparent outline-none font-body text-[15px] text-ink placeholder:text-outline"
              placeholder="Search by name, phone, or email"
            />
            <Icon name="search" className="text-outline" style={{ fontSize: 24 }} />
          </div>
          <div className="h-px bg-neutral-100 mt-3" />
        </div>

        {q.trim().length >= 2 ? (
          <div className="flex flex-col gap-4">
            <h3 className="font-body text-[16px] font-semibold text-neutral-600">{searching ? 'Searching…' : 'Results'}</h3>
            {results.map((u) => (
              <Row key={u.id} u={u}>
                {friendIds.has(u.id) ? (
                  <span className="font-caption text-caption text-tertiary flex items-center gap-1"><Icon name="check" style={{ fontSize: 18 }} />Friends</span>
                ) : (
                  <button onClick={() => add(u)} className="px-5 h-9 rounded-full bg-primary text-on-primary font-body text-[14px] font-bold shadow-soft active:scale-95 transition-transform">Add</button>
                )}
              </Row>
            ))}
            {!searching && results.length === 0 && (
              // Add-only: this creates a pending friend. Sending the join link
              // lives on their FriendDetail page (Invite button) once added.
              <InviteCard query={q} onInvite={(u) => { add(u); setQ(''); }} />
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <h3 className="font-body text-[16px] font-semibold text-neutral-600">Your friends</h3>
            {fr.loading && <RowSkeletons count={4} />}
            {friends.map((u) => {
              const net = nets.get(u.id) ?? 0;
              const pending = !!u.is_placeholder;
              return (
                <Row key={u.id} u={u} onClick={() => nav(`/friends/${u.id}`)}>
                  {nt.loading ? (
                    <span className="skeleton h-4 w-14 rounded-full" />
                  ) : net !== 0 ? (
                    <div className="flex flex-col items-end">
                      <span className={`font-body text-[16px] font-extrabold tnum ${net > 0 ? 'text-teal' : 'text-primary'}`}>
                        {net > 0 ? '+' : '-'}{rupees(Math.abs(net))}
                      </span>
                      <span className="font-caption text-caption text-neutral-600">{net > 0 ? 'owes you' : 'you owe'}</span>
                    </div>
                  ) : pending ? (
                    <span className="font-caption text-caption text-amber flex items-center gap-1">
                      <Icon name="schedule" style={{ fontSize: 16 }} />Invite pending
                    </span>
                  ) : (
                    <span className="font-caption text-caption text-neutral-600">Squared up</span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); unfriend(u); }}
                    title="Remove friend"
                    className="w-9 h-9 rounded-full flex items-center justify-center text-neutral-400 active:scale-95 transition-transform"
                  >
                    <Icon name="person_remove" style={{ fontSize: 20 }} />
                  </button>
                </Row>
              );
            })}
            {!fr.loading && friends.length === 0 && <Empty icon="group_add" text="No friends yet. Search above to add people you split with." />}
          </div>
        )}
      </main>
    </div>
  );
}

function Row({ u, children, onClick }: { u: User; children: React.ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-3 ${onClick ? 'active:scale-[0.98] transition-transform cursor-pointer' : ''}`}
    >
      <Avatar name={u.name || u.phone || '?'} size={49} />
      <div className="flex flex-col flex-1 min-w-0">
        <span className="font-body text-[16px] font-bold text-ink truncate">{u.name || 'Unnamed'}</span>
        <span className="font-body text-[12.5px] font-semibold text-neutral-600 truncate tnum">{u.phone ?? u.email ?? u.upi_vpa ?? ''}</span>
      </div>
      {children}
    </div>
  );
}

function Empty({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="border-2 border-dashed border-neutral-300 rounded-card py-10 flex flex-col items-center gap-2 text-neutral-600">
      <Icon name={icon} style={{ fontSize: 28 }} />
      <p className="font-body text-[15px] font-semibold text-center max-w-[260px]">{text}</p>
    </div>
  );
}
