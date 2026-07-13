import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient, type Balances, type Group } from '../api.js';
import { useStore } from '../store.js';
import { rupees } from '../format.js';
import { Icon, groupTypeStyle } from '../ui.js';
import { CoralBanner } from '../banners.js';

// Group icon tiles cycle the Monzo service-tile colors.
const TILE_COLORS = ['#7dc38e', '#ff4d56', '#1e738d'];

export function GroupsList() {
  const { me, groups, reloadGroups } = useStore();
  const nav = useNavigate();
  const [balByGroup, setBalByGroup] = useState<Record<number, Balances>>({});
  const [archived, setArchived] = useState<Group[]>([]);
  const [showArchived, setShowArchived] = useState(false);

  // Refetch active groups on mount so the list never shows a stale entry that
  // was archived on another screen (the archived section is always fresh).
  useEffect(() => { reloadGroups(); }, [reloadGroups]);

  useEffect(() => {
    if (!me) return;
    Promise.all(groups.map((g) => apiClient.balances(g.id).catch(() => null))).then((rows) => {
      const map: Record<number, Balances> = {};
      rows.forEach((b, i) => { const g = groups[i]; if (b && g) map[g.id] = b; });
      setBalByGroup(map);
    });
    apiClient.groups(true).then(setArchived).catch(() => setArchived([]));
  }, [me, groups]);

  const myNet = (gid: number) => balByGroup[gid]?.members.find((m) => m.user_id === me?.id)?.net_paise ?? 0;

  return (
    <div className="min-h-screen pb-28 bg-paper">
      <CoralBanner
        title="Groups"
        sub={`${groups.length} active`}
        action={
          <button onClick={() => nav('/groups/new')} aria-label="New group" className="w-9 h-9 flex items-center justify-center text-white active:scale-95 transition-transform">
            <Icon name="add" style={{ fontSize: 24 }} />
          </button>
        }
      />

      <main className="monzo-sheet mx-3 -mt-9 px-6 pb-8">
        <span className="sheet-handle" />

        <div className="flex flex-col gap-4 pt-9">
          {groups.map((g, i) => {
            const st = groupTypeStyle(g.type);
            const net = myNet(g.id);
            return (
              <Link key={g.id} to={`/groups/${g.id}`} className="flex items-center gap-3 active:scale-[0.98] transition-transform">
                <span
                  className="w-[49px] h-[49px] shrink-0 rounded-xl shadow-soft flex items-center justify-center text-white"
                  style={{ background: TILE_COLORS[i % TILE_COLORS.length] }}
                >
                  <Icon name={st.icon} fill style={{ fontSize: 26 }} />
                </span>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="font-body text-[16px] font-bold text-ink truncate">{g.name}</span>
                  <span className="font-body text-[12.5px] font-semibold text-neutral-600 truncate">
                    {g.members.length} members{g.rotation_enabled ? ' · Turn to Pay' : ''} · {net >= 0 ? 'you are owed' : 'you owe'}
                  </span>
                </div>
                <span className={`font-body text-[16px] font-extrabold tnum shrink-0 ${net >= 0 ? 'text-teal' : 'text-primary'}`}>
                  {net >= 0 ? '+' : '-'}{rupees(Math.abs(net))}
                </span>
              </Link>
            );
          })}
          {groups.length === 0 && (
            <button onClick={() => nav('/groups/new')} className="border-2 border-dashed border-neutral-300 rounded-card py-10 flex flex-col items-center gap-2 text-neutral-600">
              <Icon name="group_add" style={{ fontSize: 28 }} />
              <span className="font-body text-[15px] font-semibold">Create your first group</span>
            </button>
          )}
        </div>

        {archived.length > 0 && (
          <div className="flex flex-col gap-4 mt-8">
            <button onClick={() => setShowArchived((v) => !v)} className="flex items-center justify-between text-neutral-600">
              <span className="flex items-center gap-2 font-body text-[16px] font-semibold">
                <Icon name="inventory_2" style={{ fontSize: 20 }} /> Archived ({archived.length})
              </span>
              <Icon name={showArchived ? 'expand_less' : 'expand_more'} style={{ fontSize: 22 }} />
            </button>
            {showArchived && archived.map((g) => {
              const st = groupTypeStyle(g.type);
              return (
                <Link key={g.id} to={`/groups/${g.id}`} className="flex items-center gap-3 opacity-60 active:scale-[0.98] transition-transform">
                  <span className="w-[49px] h-[49px] shrink-0 rounded-xl bg-surface-container-high flex items-center justify-center text-secondary">
                    <Icon name={st.icon} fill style={{ fontSize: 26 }} />
                  </span>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-body text-[16px] font-bold text-ink truncate">{g.name}</span>
                    <span className="font-body text-[12.5px] font-semibold text-neutral-600">{g.members.length} members · Archived</span>
                  </div>
                  <Icon name="chevron_right" className="text-neutral-600" style={{ fontSize: 22 }} />
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
