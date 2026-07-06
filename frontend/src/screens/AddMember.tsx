import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient, ApiError, type Group, type User } from '../api.js';
import { useStore } from '../store.js';
import { Avatar, Icon } from '../ui.js';

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

  async function invite() {
    const name = q.trim();
    if (!name) return;
    setBusyId(-1); setErr(null);
    try {
      // Digits-only query → treat as phone invite; otherwise a named placeholder.
      const isPhone = /^[+0-9\s-]{8,}$/.test(name);
      const u = await apiClient.createUser(isPhone ? { name: 'Invited', phone: name } : { name });
      const g = await apiClient.addMember(gid, u.id);
      setGroup(g); reloadUsers(); setQ('');
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not invite'); }
    finally { setBusyId(null); }
  }

  const suggestions = q.trim().length >= 2 ? results : friends;
  const visible = suggestions.filter((u) => u.id !== me?.id);

  return (
    <div className="min-h-screen pb-10 bg-paper">
      <header className="flex items-center justify-between px-mobile py-3">
        <button onClick={() => nav(-1)} className="w-10 h-10 flex items-center justify-center text-primary active:scale-95 transition-transform">
          <Icon name="arrow_back" />
        </button>
        <h1 className="font-heading text-[22px] font-bold text-primary">Add Member</h1>
        <button onClick={() => nav(-1)} className="font-body text-[15px] text-primary font-medium">Done</button>
      </header>

      <main className="px-mobile flex flex-col gap-4">
        <p className="font-body text-[15px] text-on-surface-variant">Adding to <span className="text-ink font-medium">{group?.name ?? '…'}</span></p>
        <div className="relative">
          <Icon name="search" className="text-neutral-600 absolute left-4 top-1/2 -translate-y-1/2" style={{ fontSize: 22 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} className="input-warm pl-12" placeholder="Name, phone number, or email" />
        </div>
        {err && <p className="text-primary font-caption text-caption">{err}</p>}

        <div className="flex flex-col gap-3">
          <h3 className="font-caption text-caption text-on-surface-variant">{q.trim().length >= 2 ? 'Results' : 'Friends'}</h3>
          {visible.map((u) => {
            const inGroup = memberIds.has(u.id);
            return (
              <div key={u.id} className="bg-surface-container-lowest rounded-card p-3 border border-neutral-300 card-shadow flex items-center gap-3">
                <Avatar name={u.name || u.phone || '?'} size={44} />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="font-heading text-[17px] font-semibold text-ink truncate">{u.name || 'Unnamed'}</span>
                  <span className="font-caption text-caption text-neutral-600 truncate tnum">{u.phone ?? u.upi_vpa ?? ''}</span>
                </div>
                {inGroup ? (
                  <span className="font-caption text-caption text-tertiary flex items-center gap-1"><Icon name="check" style={{ fontSize: 18 }} />Added</span>
                ) : (
                  <button onClick={() => add(u)} disabled={busyId === u.id} className="px-4 h-9 rounded-button bg-primary text-on-primary font-body text-[15px] font-medium active:scale-95 transition-transform disabled:opacity-60">Add</button>
                )}
              </div>
            );
          })}

          {q.trim().length >= 2 && visible.every((u) => u.id !== me?.id) && (
            <button onClick={invite} disabled={busyId === -1} className="border border-dashed border-neutral-300 rounded-card py-5 flex flex-col items-center gap-1 text-primary active:scale-[0.99] transition-transform disabled:opacity-60">
              <Icon name="person_add" style={{ fontSize: 24 }} />
              <span className="font-body text-[15px] font-medium">Invite "{q.trim()}"</span>
            </button>
          )}
          {q.trim().length < 2 && visible.length === 0 && (
            <p className="font-body text-[15px] text-neutral-600 text-center py-4">Search to add friends or family to this group.</p>
          )}
        </div>
      </main>
    </div>
  );
}
