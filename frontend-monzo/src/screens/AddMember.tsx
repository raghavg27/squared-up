import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient, ApiError, type Group, type User } from '../api.js';
import { useStore } from '../store.js';
import { Avatar, Icon, InviteCard } from '../ui.js';
import { PageBanner } from '../banners.js';
import { shareInvite } from '../invite.js';

export function AddMember() {
  const { id } = useParams();
  const gid = Number(id);
  const nav = useNavigate();
  const { me, reloadUsers } = useStore();
  const [group, setGroup] = useState<Group | null>(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const load = () => apiClient.group(gid).then(setGroup).catch(() => {});
  useEffect(() => { load(); apiClient.friends().then(setFriends).catch(() => {}); }, [gid]);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(() => {
      apiClient.searchUsers(q.trim()).then(setResults).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  const memberIds = new Set(group?.members ?? []);

  async function add(u: User) {
    if (busyId) return;
    setBusyId(u.id); setErr(null);
    try { const g = await apiClient.addMember(gid, u.id); setGroup(g); }
    catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not add'); }
    finally { setBusyId(null); }
  }

  async function addInvited(u: User) {
    setBusyId(-1); setErr(null);
    try {
      const g = await apiClient.addMember(gid, u.id);
      setGroup(g); reloadUsers(); setQ('');
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not invite'); }
    finally { setBusyId(null); }
  }

  // Add the placeholder to the group AND share a join link, so balances track
  // now and the person inherits them when they sign in with that contact.
  async function shareInvited(u: User) {
    setBusyId(-1); setErr(null);
    try {
      const g = await apiClient.addMember(gid, u.id);
      setGroup(g); reloadUsers(); setQ('');
      await shareInvite(u, me?.name ?? '', group?.name);
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not invite'); }
    finally { setBusyId(null); }
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
                  <button onClick={() => add(u)} disabled={busyId === u.id} className="px-5 h-9 rounded-full bg-primary text-on-primary font-body text-[14px] font-bold shadow-soft active:scale-95 transition-transform disabled:opacity-60">Add</button>
                )}
              </div>
            );
          })}

          {q.trim().length >= 2 && visible.length === 0 && (
            <InviteCard query={q} busy={busyId === -1} onInvite={addInvited} onInviteLink={shareInvited} />
          )}
          {q.trim().length < 2 && visible.length === 0 && (
            <p className="font-body text-[15px] font-semibold text-neutral-600 text-center py-4">Search to add friends or family to this group.</p>
          )}
        </div>
      </main>
    </div>
  );
}
