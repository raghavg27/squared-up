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
      <div className="flex-1 bg-surface-container-lowest rounded-t-[36px] flex flex-col overflow-hidden sheet-up">
        <span className="sheet-handle shrink-0" />
        <div className="relative flex items-center justify-center pt-2 pb-4">
          <button onClick={() => nav(-1)} className="absolute left-4 w-10 h-10 flex items-center justify-center text-ink active:scale-95 transition-transform">
            <Icon name="close" />
          </button>
          <h1 className="font-heading text-[21px] font-extrabold text-ink">Add an expense</h1>
        </div>

        <div className="flex-1 overflow-y-auto px-mobile py-4 flex flex-col gap-7">
          {/* Groups */}
          <section className="flex flex-col gap-4">
            <p className="font-body text-[16px] font-semibold text-neutral-600">In a group</p>
            {groups.map((g, i) => {
              const st = groupTypeStyle(g.type);
              const tone = ['#7dc38e', '#ff4d56', '#1e738d'][i % 3];
              return (
                <button
                  key={g.id}
                  onClick={() => nav(`/groups/${g.id}/add`)}
                  className="flex items-center gap-3 active:scale-[0.98] transition-transform"
                >
                  <span className="w-[49px] h-[49px] rounded-xl shadow-soft flex items-center justify-center text-white" style={{ background: tone }}>
                    <Icon name={st.icon} fill style={{ fontSize: 24 }} />
                  </span>
                  <span className="flex-1 text-left font-body text-[16px] font-bold text-ink truncate">{g.name}</span>
                  <Icon name="chevron_right" className="text-neutral-600" />
                </button>
              );
            })}
            <button onClick={() => nav('/groups/new')} className="flex items-center gap-3 text-neutral-600 active:scale-[0.98] transition-transform">
              <span className="w-[49px] h-[49px] rounded-xl border-2 border-dashed border-neutral-300 flex items-center justify-center"><Icon name="add" /></span>
              <span className="font-body text-[15px] font-semibold">New group</span>
            </button>
          </section>

          {/* Personal — with a friend, no group */}
          <section className="flex flex-col gap-4">
            <p className="font-body text-[16px] font-semibold text-neutral-600">With a friend (no group)</p>
            <div>
              <div className="flex items-center gap-3">
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="flex-1 bg-transparent outline-none font-body text-[15px] text-ink placeholder:text-outline"
                  placeholder="Search friends & group members"
                />
                <Icon name="search" className="text-outline" style={{ fontSize: 24 }} />
              </div>
              <div className="h-px bg-neutral-100 mt-3" />
            </div>
            {q.trim() ? (
              matches.length ? (
                matches.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => nav(`/add/personal/${u.id}`)}
                    className="flex items-center gap-3 active:scale-[0.98] transition-transform"
                  >
                    <Avatar name={u.name || u.phone || '?'} size={49} />
                    <span className="flex-1 text-left font-body text-[16px] font-bold text-ink truncate">{u.name || 'Unnamed'}</span>
                    <Icon name="chevron_right" className="text-neutral-600" />
                  </button>
                ))
              ) : (
                <p className="font-body text-[15px] font-semibold text-neutral-600 px-1">No one here by that name. Add a new friend below.</p>
              )
            ) : null}
            <button onClick={() => nav('/friends')} className="flex items-center gap-3 text-neutral-600 active:scale-[0.98] transition-transform">
              <span className="w-[49px] h-[49px] rounded-xl border-2 border-dashed border-neutral-300 flex items-center justify-center"><Icon name="person_add" /></span>
              <span className="font-body text-[15px] font-semibold">Add a new friend</span>
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
