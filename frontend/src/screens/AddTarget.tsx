import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient, type User } from '../api.js';
import { useStore } from '../store.js';
import { Avatar, Icon, groupTypeStyle } from '../ui.js';

// Central "where should this expense go?" chooser. Opened from the Home FAB so
// the + is a hub — any group, or a personal (non-group) split with a friend.
export function AddTarget() {
  const nav = useNavigate();
  const { me, groups } = useStore();
  // Everyone the caller can split with: explicit friends + co-members of any
  // shared group (the scoped /users directory), minus self.
  const [people, setPeople] = useState<User[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    apiClient.users().then((us) => setPeople(us.filter((u) => u.id !== me?.id))).catch(() => {});
  }, [me]);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return [];
    return people.filter((u) =>
      (u.name || '').toLowerCase().includes(t) ||
      (u.phone || '').includes(t) ||
      (u.upi_vpa || '').toLowerCase().includes(t),
    );
  }, [q, people]);

  return (
    <div className="fixed inset-0 z-50 bg-surface-dim flex flex-col max-w-[28rem] mx-auto">
      <button className="h-16 w-full shrink-0" onClick={() => nav(-1)} aria-label="Close" />
      <div className="flex-1 bg-surface-container-lowest rounded-t-[28px] flex flex-col overflow-hidden sheet-up">
        <div className="relative flex items-center justify-center py-4 border-b border-neutral-100">
          <button onClick={() => nav(-1)} className="absolute left-4 w-10 h-10 flex items-center justify-center text-ink active:scale-95 transition-transform">
            <Icon name="close" />
          </button>
          <h1 className="font-heading text-[22px] font-bold text-ink">Add an expense</h1>
        </div>

        <div className="flex-1 overflow-y-auto px-mobile py-5 flex flex-col gap-6">
          {/* Groups */}
          <section className="flex flex-col gap-3">
            <p className="font-caption text-caption text-secondary tracking-wide">IN A GROUP</p>
            {groups.map((g) => {
              const st = groupTypeStyle(g.type);
              return (
                <button
                  key={g.id}
                  onClick={() => nav(`/groups/${g.id}/add`)}
                  className="bg-surface-container-lowest rounded-card border border-neutral-300 card-shadow px-4 py-3 flex items-center gap-3 active:scale-[0.98] transition-transform"
                >
                  <div className={`w-10 h-10 rounded-button flex items-center justify-center ${st.tint} ${st.fg}`}>
                    <Icon name={st.icon} fill style={{ fontSize: 22 }} />
                  </div>
                  <span className="flex-1 text-left font-heading text-[17px] font-semibold text-ink">{g.name}</span>
                  <Icon name="chevron_right" className="text-neutral-600" />
                </button>
              );
            })}
            <button
              onClick={() => nav('/groups/new')}
              className="bg-surface-container border border-dashed border-neutral-300 rounded-card px-4 py-3 flex items-center gap-3 text-neutral-600 active:scale-[0.98] transition-transform"
            >
              <div className="w-10 h-10 rounded-button bg-neutral-100 flex items-center justify-center"><Icon name="add" /></div>
              <span className="font-body text-[15px] font-medium">New group</span>
            </button>
          </section>

          {/* Personal — with a friend, no group */}
          <section className="flex flex-col gap-3">
            <p className="font-caption text-caption text-secondary tracking-wide">WITH A FRIEND (NO GROUP)</p>
            <div className="relative">
              <Icon name="search" className="text-neutral-600 absolute left-4 top-1/2 -translate-y-1/2" style={{ fontSize: 22 }} />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="input-warm pl-12"
                placeholder="Search friends & group members"
              />
            </div>
            {q.trim() ? (
              matches.length ? (
                matches.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => nav(`/add/personal/${u.id}`)}
                    className="bg-surface-container-lowest rounded-card border border-neutral-300 card-shadow px-4 py-3 flex items-center gap-3 active:scale-[0.98] transition-transform"
                  >
                    <Avatar name={u.name || u.phone || '?'} size={40} />
                    <span className="flex-1 text-left font-heading text-[17px] font-semibold text-ink truncate">{u.name || 'Unnamed'}</span>
                    <Icon name="chevron_right" className="text-neutral-600" />
                  </button>
                ))
              ) : (
                <p className="font-body text-[15px] text-neutral-600 px-1">No one here by that name. Add a new friend below.</p>
              )
            ) : null}
            <button
              onClick={() => nav('/friends')}
              className="bg-surface-container border border-dashed border-neutral-300 rounded-card px-4 py-3 flex items-center gap-3 text-neutral-600 active:scale-[0.98] transition-transform"
            >
              <div className="w-10 h-10 rounded-button bg-neutral-100 flex items-center justify-center"><Icon name="person_add" /></div>
              <span className="font-body text-[15px] font-medium">Add a new friend</span>
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
