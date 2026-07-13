import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient, type Group, type User } from '../api.js';
import { friendlyError } from '../errors.js';
import { useStore } from '../store.js';
import { useToast } from '../toast.js';
import { Avatar, Icon, InviteCard } from '../ui.js';
import { PageBanner } from '../banners.js';
import { shareInvite } from '../invite.js';

export function AddMember() {
  const { id } = useParams();
  const gid = Number(id);
  const nav = useNavigate();
  const { me, reloadUsers } = useStore();
  const { showToast } = useToast();
  const [group, setGroup] = useState<Group | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [hasExpenses, setHasExpenses] = useState(false);
  // Person picked but not yet added: we first ask whether they should share
  // the group's past expenses. `share` = also send them a join link after.
  const [pending, setPending] = useState<{ user: User; share: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    apiClient.group(gid).then(setGroup).catch(() => {});
    apiClient.friends().then(setFriends).catch(() => {});
    apiClient.expenses(gid).then((es) => setHasExpenses(es.length > 0)).catch(() => {});
  }, [gid]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(() => {
      apiClient.searchUsers(q.trim()).then(setResults).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  const memberIds = new Set(group?.members ?? []);

  // No expenses yet → nothing to back-include, skip the question entirely.
  function pick(u: User, share: boolean) {
    if (busy) return;
    if (hasExpenses) setPending({ user: u, share });
    else void finish(u, false, share);
  }

  async function finish(u: User, includeHistory: boolean, share: boolean) {
    setBusy(true); setErr(null);
    try {
      const g = await apiClient.addMember(gid, u.id, includeHistory);
      reloadUsers(); // placeholder invitees must resolve in name() immediately
      if (share) await shareInvite(u, me?.name ?? '', group?.name);
      const n = g.history_included;
      showToast(
        `${u.name || 'Member'} added to ${group?.name ?? 'the group'}` +
        (n > 0 ? ` — split into ${n} past expense${n === 1 ? '' : 's'}` : ''),
      );
      nav(-1); // back to Group Settings
    } catch (e) {
      setErr(friendlyError(e, 'Could not add — try again'));
      setPending(null);
      setBusy(false);
    }
  }

  const suggestions = q.trim().length >= 2 ? results : friends;
  const visible = suggestions.filter((u) => u.id !== me?.id);

  return (
    <div className="min-h-screen pb-10 bg-paper">
      <PageBanner
        title="Add Member"
        sub={`Adding to ${group?.name ?? '…'}`}
        action={
          <button onClick={() => nav(-1)} className="px-3 h-10 font-body text-[15px] text-white font-bold active:scale-95 transition-transform">Done</button>
        }
      />

      <main className="monzo-sheet mx-3 -mt-9 px-6 pb-8 flex flex-col gap-4">
        <span className="sheet-handle" />

        {/* Monzo search row */}
        <div className="mt-4">
          <div className="flex items-center gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="flex-1 bg-transparent outline-none font-body text-[15px] text-ink placeholder:text-outline"
              placeholder="Name, phone number, or email"
            />
            <Icon name="search" className="text-outline" style={{ fontSize: 24 }} />
          </div>
          <div className="h-px bg-neutral-100 mt-3" />
        </div>
        {err && <p className="text-primary font-caption text-caption">{err}</p>}

        <div className="flex flex-col gap-4">
          <h3 className="font-body text-[16px] font-semibold text-neutral-600">{q.trim().length >= 2 ? 'Results' : 'Friends'}</h3>
          {visible.map((u) => {
            const inGroup = memberIds.has(u.id);
            return (
              <div key={u.id} className="flex items-center gap-3">
                <Avatar name={u.name || u.phone || '?'} size={49} />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="font-body text-[16px] font-bold text-ink truncate">{u.name || 'Unnamed'}</span>
                  <span className="font-body text-[12.5px] font-semibold text-neutral-600 truncate tnum">{u.phone ?? u.email ?? u.upi_vpa ?? ''}</span>
                </div>
                {inGroup ? (
                  <span className="font-body text-[13px] font-bold text-teal flex items-center gap-1"><Icon name="check" style={{ fontSize: 18 }} />Added</span>
                ) : (
                  <button onClick={() => pick(u, false)} disabled={busy} className="px-5 h-9 rounded-full bg-primary text-on-primary font-body text-[14px] font-bold shadow-soft active:scale-95 transition-transform disabled:opacity-60">Add</button>
                )}
              </div>
            );
          })}

          {q.trim().length >= 2 && visible.length === 0 && (
            <InviteCard query={q} busy={busy} onInvite={(u) => pick(u, false)} onInviteLink={(u) => pick(u, true)} />
          )}
          {q.trim().length < 2 && visible.length === 0 && (
            <p className="font-body text-[15px] font-semibold text-neutral-600 text-center py-4">Search to add friends or family to this group.</p>
          )}
        </div>
      </main>

      {/* Include-in-history choice — asked once per add, before anything saves */}
      {pending && (
        <div className="fixed inset-0 z-50 bg-ink/40 flex flex-col justify-end max-w-[28rem] mx-auto" onClick={() => !busy && setPending(null)}>
          <div className="bg-surface-container-lowest rounded-t-[36px] px-6 pt-3 pb-8 sheet-up" onClick={(e) => e.stopPropagation()}>
            <span className="sheet-handle" />
            <h2 className="font-heading text-[20px] font-extrabold text-ink text-center mt-2">
              Add {pending.user.name || 'this person'} to {group?.name ?? 'the group'}?
            </h2>
            <p className="font-body text-[14px] font-semibold text-neutral-600 text-center mt-2 leading-snug">
              Should they also share the group's existing expenses? Only evenly-split ones are re-split — exact and itemized splits stay as they are.
            </p>
            <div className="flex flex-col gap-3 mt-5">
              <button onClick={() => finish(pending.user, true, pending.share)} disabled={busy} className="btn-coral justify-center text-[16px] disabled:opacity-60">
                {busy ? 'Adding…' : 'Include past expenses'}
              </button>
              <button
                onClick={() => finish(pending.user, false, pending.share)}
                disabled={busy}
                className="w-full h-[52px] rounded-full bg-surface shadow-soft text-ink font-heading text-[15px] font-bold active:scale-[0.98] transition-transform disabled:opacity-60"
              >
                Only new expenses
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
