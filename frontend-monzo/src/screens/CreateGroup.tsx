import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient, ApiError, type User } from '../api.js';
import { useStore } from '../store.js';
import { Avatar, Icon, InviteCard } from '../ui.js';
import { PageBanner } from '../banners.js';

const TYPES = [
  { key: 'trip', label: 'Trip', icon: 'flight_takeoff' },
  { key: 'home', label: 'Home', icon: 'home' },
  { key: 'couple', label: 'Couple', icon: 'favorite' },
  { key: 'personal', label: 'Personal', icon: 'person' },
  { key: 'other', label: 'Other', icon: 'more_horiz' },
];

export function CreateGroup() {
  const { me, groups, reloadGroups, reloadUsers } = useStore();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [type, setType] = useState('trip');
  const [customType, setCustomType] = useState('');
  const [rotation, setRotation] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Custom types this user already created (stored as free text on their
  // groups) come back as first-class picker tiles.
  const customTypes = useMemo(() => {
    const std = new Set(TYPES.map((t) => t.key));
    return [...new Set(groups.map((g) => g.type).filter((t) => t && !std.has(t)))];
  }, [groups]);

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

  // Clearing the query also dismisses the invite card that a no-match search
  // (e.g. a partial phone number) may have left behind.
  function pick(u: User) { setPicked((p) => [...p, u]); setQ(''); setResults([]); }
  function unpick(id: number) { setPicked((p) => p.filter((u) => u.id !== id)); }

  // Personal tracker = solo spend log: no other members, no Turn to Pay.
  const isPersonal = type === 'personal';

  async function create() {
    if (!me || busy) return;
    if (!name.trim()) { setErr('Give your group a name'); return; }
    const finalType = type === 'other' && customType.trim() ? customType.trim() : type;
    setBusy(true); setErr(null);
    try {
      const g = await apiClient.createGroup({
        name: name.trim(), type: finalType, created_by: me.id,
        member_ids: isPersonal ? [] : picked.map((u) => u.id),
        rotation_enabled: isPersonal ? false : rotation, rotation_mode: 'balanced',
      });
      reloadGroups();
      reloadUsers();
      nav(`/groups/${g.id}`, { replace: true });
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not create the group — try again'); setBusy(false); }
  }

  return (
    <div className="min-h-screen pb-32 bg-paper">
      <PageBanner title="Create Group" sub="Trips, flats, or just the two of you" />

      <main className="monzo-sheet mx-3 -mt-9 px-6 pb-8 flex flex-col gap-6">
        <span className="sheet-handle" />

        {/* Group Details */}
        <section className="flex flex-col gap-3 pt-4">
          <h2 className="font-body text-[16px] font-semibold text-neutral-600">Group details</h2>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input-warm shadow-soft" placeholder="e.g., Summer Trip, Apartment 4B" />
        </section>

        {/* Group Type — Monzo service-tile picker */}
        <section className="flex flex-col gap-3">
          <h3 className="font-body text-[16px] font-semibold text-neutral-600">Group type</h3>
          <div className="grid grid-cols-4 gap-3">
            {[...TYPES, ...customTypes.map((t) => ({ key: t, label: t, icon: 'label' }))].map((t) => {
              const active = type === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setType(t.key)}
                  className={`h-[84px] rounded-card flex flex-col items-center justify-center gap-1.5 px-1 transition-all active:scale-95 ${active ? 'bg-primary text-white shadow-tile-coral' : 'bg-surface shadow-soft text-secondary'}`}
                >
                  <Icon name={t.icon} fill={active} style={{ fontSize: 26 }} />
                  <span className="text-[11px] font-bold max-w-full truncate">{t.label}</span>
                </button>
              );
            })}
          </div>
          {type === 'other' && (
            <input
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              maxLength={24}
              className="input-warm shadow-soft"
              placeholder="Name your own type — e.g. Office, Society"
            />
          )}
        </section>

        {isPersonal && (
          <div className="flex items-start gap-3 bg-teal/10 rounded-card p-4">
            <Icon name="person" fill className="text-tertiary mt-0.5" style={{ fontSize: 22 }} />
            <p className="font-body text-[13.5px] font-semibold text-neutral-600 leading-snug">
              A personal tracker is just you — log your own spending and see it in Insights. No members, no balances, no settling up.
            </p>
          </div>
        )}

        {/* Add Members — a personal tracker is solo, so nothing to add */}
        {!isPersonal && (
        <section className="flex flex-col gap-4">
          <div className="flex items-end justify-between">
            <h2 className="font-body text-[16px] font-semibold text-neutral-600">Add members</h2>
            <span className="font-body text-[13px] font-semibold text-outline">{picked.length + 1}/50</span>
          </div>
          <div>
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

          {/* Selected members (you are always the owner) */}
          <div className="flex items-center gap-3">
            <Avatar name={me?.name ?? 'You'} size={49} />
            <div className="flex flex-col flex-1">
              <span className="font-body text-[16px] font-bold text-ink">You</span>
              <span className="font-body text-[12.5px] font-semibold text-neutral-600">Admin</span>
            </div>
          </div>
          {picked.map((u) => (
            <div key={u.id} className="flex items-center gap-3">
              <Avatar name={u.name || u.phone || '?'} size={49} />
              <div className="flex flex-col flex-1 min-w-0">
                <span className="font-body text-[16px] font-bold text-ink truncate">{u.name || 'Unnamed'}</span>
                <span className="font-body text-[12.5px] font-semibold text-neutral-600 truncate tnum">{u.phone ?? u.upi_vpa ?? 'Member'}</span>
              </div>
              <button onClick={() => unpick(u.id)} className="w-9 h-9 rounded-full flex items-center justify-center text-primary active:scale-95 transition-transform">
                <Icon name="close" style={{ fontSize: 20 }} />
              </button>
            </div>
          ))}

          {/* Suggestions / search results */}
          {suggestions.length > 0 && (
            <div className="flex flex-col gap-4">
              <h3 className="font-body text-[13px] font-semibold text-outline mt-1">{q.trim().length >= 2 ? 'Results' : 'Friends'}</h3>
              {suggestions.map((u) => (
                <div key={u.id} className="flex items-center gap-3">
                  <Avatar name={u.name || u.phone || '?'} size={49} />
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-body text-[16px] font-bold text-ink truncate">{u.name || 'Unnamed'}</span>
                    <span className="font-body text-[12.5px] font-semibold text-neutral-600 truncate tnum">{u.phone ?? u.upi_vpa ?? ''}</span>
                  </div>
                  <button onClick={() => pick(u)} className="px-5 h-9 rounded-full bg-primary text-on-primary font-body text-[14px] font-bold shadow-soft active:scale-95 transition-transform">Add</button>
                </div>
              ))}
            </div>
          )}

          {q.trim().length >= 2 && suggestions.length === 0 && (
            <InviteCard query={q} onInvite={(u) => { setPicked((p) => [...p, u]); setQ(''); }} />
          )}
          {q.trim().length < 2 && picked.length === 0 && suggestions.length === 0 && (
            <div className="border-2 border-dashed border-neutral-300 rounded-card py-8 flex flex-col items-center gap-2 text-neutral-600">
              <Icon name="person_add" style={{ fontSize: 26 }} />
              <p className="font-body text-[15px] font-semibold text-center max-w-[240px]">Search to add friends or family. You can also add members later.</p>
            </div>
          )}
        </section>
        )}

        {/* Features */}
        {!isPersonal && (
        <section className="flex flex-col gap-3">
          <h2 className="font-body text-[16px] font-semibold text-neutral-600">Features</h2>
          <div className="flex items-start gap-3">
            <span className="w-[49px] h-[49px] rounded-xl bg-surface shadow-soft text-primary flex items-center justify-center shrink-0">
              <Icon name="autorenew" style={{ fontSize: 24 }} />
            </span>
            <div className="flex-1">
              <span className="font-body text-[16px] font-bold text-ink">Turn to Pay</span>
              <p className="font-body text-[12.5px] font-semibold text-neutral-600 leading-snug mt-0.5">
                Automatically rotate who pays next based on past spending to keep things fair.
              </p>
            </div>
            <Toggle on={rotation} onChange={setRotation} />
          </div>
        </section>
        )}

        {err && <p className="text-danger font-body text-[13px] font-semibold">{err}</p>}
      </main>

      {/* z-10: must sit above the monzo-sheet (z-1) or its content eats taps */}
      <div className="fixed bottom-0 left-0 right-0 z-10 max-w-[28rem] mx-auto px-6 pb-5 pt-3 safe-bottom bg-gradient-to-t from-paper via-paper to-transparent">
        <button onClick={create} disabled={busy} className="btn-coral justify-center text-[17px]">
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
      className={`w-12 h-7 rounded-full shrink-0 relative transition-colors ${on ? 'bg-teal' : 'bg-surface-container-highest'}`}
    >
      <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-surface-container-lowest shadow-soft transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
    </button>
  );
}
