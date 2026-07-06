import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiClient, type Balances } from '../api.js';
import { useStore } from '../store.js';
import { rupees } from '../format.js';
import { Icon, groupTypeStyle } from '../ui.js';

export function GroupsList() {
  const { me, groups } = useStore();
  const nav = useNavigate();
  const [balByGroup, setBalByGroup] = useState<Record<number, Balances>>({});

  useEffect(() => {
    if (!me) return;
    Promise.all(groups.map((g) => apiClient.balances(g.id).catch(() => null))).then((rows) => {
      const map: Record<number, Balances> = {};
      rows.forEach((b, i) => { const g = groups[i]; if (b && g) map[g.id] = b; });
      setBalByGroup(map);
    });
  }, [me, groups]);

  const myNet = (gid: number) => balByGroup[gid]?.members.find((m) => m.user_id === me?.id)?.net_paise ?? 0;

  return (
    <div className="min-h-screen pb-28 bg-paper">
      <header className="bg-paper sticky top-0 z-40 flex items-center justify-between px-mobile py-3">
        <h1 className="font-heading text-[22px] font-bold text-primary">Squared Up</h1>
        <button onClick={() => nav('/groups/new')} className="w-10 h-10 flex items-center justify-center text-primary active:scale-95 transition-transform">
          <Icon name="add" />
        </button>
      </header>

      <main className="px-mobile flex flex-col gap-4 stagger">
        <h2 className="font-heading text-[32px] font-bold text-ink mt-2">Groups</h2>
        <div className="flex flex-col gap-3">
          {groups.map((g) => {
            const st = groupTypeStyle(g.type);
            const net = myNet(g.id);
            return (
              <Link key={g.id} to={`/groups/${g.id}`} className="bg-surface-container-lowest rounded-card p-4 border border-neutral-300 card-shadow flex items-center gap-3 active:scale-[0.99] transition-transform">
                <div className={`w-12 h-12 rounded-button flex items-center justify-center shrink-0 ${st.tint} ${st.fg}`}>
                  <Icon name={st.icon} fill style={{ fontSize: 24 }} />
                </div>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="font-heading text-[17px] font-semibold text-ink truncate">{g.name}</span>
                  <span className="font-caption text-caption text-neutral-600">{g.members.length} members{g.rotation_enabled ? ' • Turn to Pay' : ''}</span>
                </div>
                <div className="flex flex-col items-end shrink-0">
                  <span className={`font-currency text-[15px] font-semibold tnum ${net >= 0 ? 'text-success' : 'text-primary'}`}>
                    {net >= 0 ? '+' : '-'}{rupees(Math.abs(net))}
                  </span>
                  <span className="font-caption text-caption text-neutral-600">{net >= 0 ? 'you are owed' : 'you owe'}</span>
                </div>
              </Link>
            );
          })}
          {groups.length === 0 && (
            <button onClick={() => nav('/groups/new')} className="border border-dashed border-neutral-300 rounded-card py-10 flex flex-col items-center gap-2 text-neutral-600">
              <Icon name="group_add" style={{ fontSize: 28 }} />
              <span className="font-body text-[15px]">Create your first group</span>
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
