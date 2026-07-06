import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient, ApiError, type User } from '../api.js';
import { useStore } from '../store.js';
import { Avatar, Icon, InviteCard } from '../ui.js';

const TYPES = [
  { key: 'trip', label: 'Trip', icon: 'flight_takeoff' },
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'couple', label: 'Couple', icon: 'favorite' },
  { key: 'other', label: 'Other', icon: 'more_horiz' },
];

export function CreateGroup() {
  const { me, reloadGroups, reloadUsers } = useStore();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [type, setType] = useState('trip');
  const [rotation, setRotation] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [q, setQ] = useState('');
  const [results, setResults] = useState<User[]>([]);
  const [friends, setFriends] = useState<User[]>([]);
  const [picked, setPicked] = useState<User[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { apiClient.friends().then(setFriends).catch(() => {}); }, []);

  useEffect(() => {
    clearTimeout(timer.current);
    if (q.trim().length < 2) { setResults([]); return; }
    timer.current = setTimeout(() => {
      apiClient.searchUsers(q.trim()).then(setResults).catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  const pickedIds = new Set(picked.map((u) => u.id));
  const suggestions = (q.trim().length >= 2 ? results : friends).filter((u) => u.id !== me?.id && !pickedIds.has(u.id));

  function pick(u: User) { setPicked((p) => [...p, u]); }
  function unpick(id: number) { setPicked((p) => p.filter((u) => u.id !== id)); }

  async function create() {
    if (!me || busy) return;
    if (!name.trim()) { setErr('Give your group a name'); return; }
    setBusy(true); setErr(null);
    try {
      const g = await apiClient.createGroup({
        name: name.trim(), type, created_by: me.id, member_ids: picked.map((u) => u.id),
        rotation_enabled: rotation, rotation_mode: 'balanced',
      });
      reloadGroups();
      reloadUsers();
      nav(`/groups/${g.id}`, { replace: true });
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not create the group — try again'); setBusy(false); }
  }

  return (
    <div className="min-h-screen pb-28 bg-paper">
      <header className="flex items-center px-mobile py-3 relative">
        <button onClick={() => nav(-1)} className="w-10 h-10 flex items-center justify-center text-ink active:scale-95 transition-transform">
          <Icon name="close" />
        </button>
        <h1 className="font-heading text-[22px] font-bold text-primary absolute left-1/2 -translate-x-1/2">Create Group</h1>
      </header>

      <main className="px-mobile flex flex-col gap-6 mt-2">
        {/* Group Details */}
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-[22px] font-bold text-ink">Group Details</h2>
          <div className="bg-surface-container-lowest rounded-card p-4 border border-neutral-300 card-shadow">
            <label className="font-caption text-caption text-on-surface-variant block mb-2">Group Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input-warm" placeholder="e.g., Summer Trip, Apartment 4B" />
          </div>
        </section>

        {/* Group Type */}
        <section className="flex flex-col gap-3">
          <h3 className="font-caption text-caption text-on-surface-variant">Group Type</h3>
          <div className="grid grid-cols-2 gap-4">
            {TYPES.map((t) => {
              const active = type === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setType(t.key)}
                  className={`h-[92px] rounded-card flex flex-col items-center justify-center gap-2 border transition-colors ${active ? 'border-primary bg-primary/5 text-primary' : 'border-neutral-300 bg-surface-container-lowest text-ink'}`}
                >
                  <Icon name={t.icon} style={{ fontSize: 26 }} />
                  <span className="font-body text-[15px] font-medium">{t.label}</span>
                </button>
              );
            })}
          </div>
        </section>

        <div className="h-px bg-neutral-300" />

        {/* Add Members */}
        <section className="flex flex-col gap-3">
          <div className="flex items-end justify-between">
            <h2 className="font-heading text-[22px] font-bold text-ink">Add Members</h2>
            <span className="font-caption text-caption text-on-surface-variant">{picked.length + 1}/50</span>
          </div>
          <div className="relative">
            <Icon name="search" className="text-neutral-600 absolute left-4 top-1/2 -translate-y-1/2" style={{ fontSize: 22 }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} className="input-warm pl-12" placeholder="Name, phone number, or email" />
          </div>

          {/* Selected members (you are always the owner) */}
          <div className="bg-surface-container-lowest rounded-card p-3 border border-neutral-300 card-shadow flex items-center gap-3">
            <Avatar name={me?.name ?? 'You'} size={48} />
            <div className="flex flex-col flex-1">
              <span className="font-heading text-[17px] font-semibold text-ink">You</span>
              <span className="font-caption text-caption text-on-surface-variant">Admin</span>
            </div>
          </div>
          {picked.map((u) => (
            <div key={u.id} className="bg-surface-container-lowest rounded-card p-3 border border-neutral-300 card-shadow flex items-center gap-3">
              <Avatar name={u.name || u.phone || '?'} size={48} />
              <div className="flex flex-col flex-1 min-w-0">
                <span className="font-heading text-[17px] font-semibold text-ink truncate">{u.name || 'Unnamed'}</span>
                <span className="font-caption text-caption text-on-surface-variant truncate tnum">{u.phone ?? u.upi_vpa ?? 'Member'}</span>
              </div>
              <button onClick={() => unpick(u.id)} className="w-9 h-9 rounded-full flex items-center justify-center text-primary active:scale-95 transition-transform">
                <Icon name="close" style={{ fontSize: 20 }} />
              </button>
            </div>
          ))}

          {/* Suggestions / search results */}
          {suggestions.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="font-caption text-caption text-on-surface-variant mt-1">{q.trim().length >= 2 ? 'Results' : 'Friends'}</h3>
              {suggestions.map((u) => (
                <div key={u.id} className="bg-surface-container-lowest rounded-card p-3 border border-neutral-300 card-shadow flex items-center gap-3">
                  <Avatar name={u.name || u.phone || '?'} size={44} />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-heading text-[17px] font-semibold text-ink truncate">{u.name || 'Unnamed'}</span>
                    <span className="font-caption text-caption text-neutral-600 truncate tnum">{u.phone ?? u.upi_vpa ?? ''}</span>
                  </div>
                  <button onClick={() => pick(u)} className="px-4 h-9 rounded-button bg-primary text-on-primary font-body text-[15px] font-medium active:scale-95 transition-transform">Add</button>
                </div>
              ))}
            </div>
          )}

          {q.trim().length >= 2 && suggestions.length === 0 && (
            <InviteCard query={q} onInvite={(u) => { setPicked((p) => [...p, u]); setQ(''); }} />
          )}
          {q.trim().length < 2 && picked.length === 0 && suggestions.length === 0 && (
            <div className="border border-dashed border-neutral-300 rounded-card py-8 flex flex-col items-center gap-2 text-neutral-600 bg-surface-container-low/40">
              <Icon name="person_add" style={{ fontSize: 26 }} />
              <p className="font-body text-[15px] text-center max-w-[240px]">Search to add friends or family. You can also add members later.</p>
            </div>
          )}
        </section>

        <div className="h-px bg-neutral-300" />

        {/* Features */}
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-[22px] font-bold text-ink">Features</h2>
          <div className="bg-surface-container-lowest rounded-card p-4 border border-neutral-300 card-shadow flex items-start gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2 text-ink">
                <Icon name="autorenew" className="text-plum" style={{ fontSize: 22 }} />
                <span className="font-heading text-[17px] font-bold">Turn to Pay</span>
              </div>
              <p className="font-body text-[15px] text-on-surface-variant leading-snug mt-1">
                Automatically rotate who pays next based on past spending to keep things fair.
              </p>
            </div>
            <Toggle on={rotation} onChange={setRotation} />
          </div>
        </section>

        {err && <p className="text-danger font-body text-[13px]">{err}</p>}
      </main>

      <div className="fixed bottom-0 left-0 right-0 max-w-[28rem] mx-auto px-mobile pb-5 pt-3 safe-bottom bg-gradient-to-t from-paper via-paper to-transparent">
        <button onClick={create} disabled={busy} className="w-full h-[56px] bg-primary text-on-primary rounded-button font-heading text-[17px] font-bold active:scale-[0.98] transition-transform disabled:opacity-60">
          {busy ? 'Creating…' : 'Create Group'}
        </button>
      </div>
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`w-12 h-7 rounded-full shrink-0 relative transition-colors ${on ? 'bg-primary' : 'bg-surface-container-highest'}`}
    >
      <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-surface-container-lowest border border-neutral-300 transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}
