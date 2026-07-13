import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '../api.js';
import { useStore } from '../store.js';
import { useCached } from '../cache.js';
import { friendlyError } from '../errors.js';
import { rupees, rupees0 } from '../format.js';
import { Avatar, Icon, categoryStyle } from '../ui.js';
import { PageBanner } from '../banners.js';
import { RowSkeletons } from '../skeletons.js';
import { LoadErrorCard } from '../ErrorBoundary.js';

export function GroupSummary() {
  const { id } = useParams();
  const gid = Number(id);
  const nav = useNavigate();
  const { me, name } = useStore();

  // Shares cache keys with GroupDetail, so arriving from there is instant.
  const g = useCached(`group:${gid}`, () => apiClient.group(gid));
  const b = useCached(`balances:${gid}`, () => apiClient.balances(gid));
  const ex = useCached(`expenses:${gid}`, () => apiClient.expenses(gid));

  const group = g.data ?? null;
  const balances = b.data ?? null;
  const expenses = ex.data ?? [];
  const coldLoading = b.loading || ex.loading;
  const loadError = !coldLoading && !balances ? b.error ?? ex.error : undefined;

  const members = balances?.members ?? [];
  const settlements = balances?.simplified_settlements ?? [];
  const allSettled = members.every((m) => m.net_paise === 0);

  // Client-side category insight from descriptions — no backend change needed.
  const catBreakdown = useMemo(() => {
    const map = new Map<string, { label: string; icon: string; tint: string; fg: string; bar: string; total: number }>();
    let grand = 0;
    for (const e of expenses) {
      const c = categoryStyle(e.category, e.description);
      grand += e.amount_paise;
      const cur = map.get(c.label) ?? { ...c, total: 0 };
      cur.total += e.amount_paise;
      map.set(c.label, cur);
    }
    const rows = [...map.values()].sort((a, b) => b.total - a.total).slice(0, 5);
    return { rows, grand };
  }, [expenses]);

  return (
    <div className="min-h-screen pb-10 bg-paper">
      <PageBanner
        title="Balance Summary"
        sub={`${group?.name ?? '…'} · ${members.length} ${members.length === 1 ? 'member' : 'members'}`}
      />

      <main className="monzo-sheet mx-3 -mt-9 px-6 pb-8 flex flex-col gap-6">
        <span className="sheet-handle" />

        {coldLoading && <div className="pt-4"><RowSkeletons count={5} /></div>}

        {loadError !== undefined && (
          <div className="pt-4">
            <LoadErrorCard
              message={friendlyError(loadError, "Couldn't load this summary — give it another try.")}
              onRetry={() => { g.refresh(); b.refresh(); ex.refresh(); }}
            />
          </div>
        )}

        {!coldLoading && loadError === undefined && (<>
        {/* Who owes whom — the simplified settlement plan */}
        <section className="flex flex-col gap-4 pt-4">
          <h3 className="font-body text-[16px] font-semibold text-neutral-600">Who pays whom</h3>
          {allSettled ? (
            <div className="border-2 border-dashed border-neutral-300 rounded-card py-10 flex flex-col items-center gap-2 text-teal">
              <Icon name="celebration" fill style={{ fontSize: 30 }} />
              <p className="font-body text-[15px] font-semibold text-neutral-600">Everyone is squared up.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {settlements.map((s, i) => {
                const iPay = s.from_user === me?.id;
                const iReceive = s.to_user === me?.id;
                return (
                  <div key={i} className="flex items-center gap-3">
                    <div className="flex items-center -space-x-2 shrink-0">
                      <Avatar name={name(s.from_user)} size={40} me={iPay} />
                      <Avatar name={name(s.to_user)} size={40} me={iReceive} />
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="font-body text-[15px] font-bold text-ink truncate">
                        {iPay ? 'You' : name(s.from_user)} {iPay ? 'pay' : 'pays'} {iReceive ? 'you' : name(s.to_user)}
                      </span>
                      <span className="font-body text-[12.5px] font-semibold text-neutral-600 tnum">{rupees(s.amount_paise)}</span>
                    </div>
                    {iPay && (
                      <button
                        onClick={() => nav(`/settle/${gid}/${s.to_user}`)}
                        className="px-5 h-9 shrink-0 rounded-full bg-primary text-on-primary font-body text-[14px] font-bold shadow-soft active:scale-95 transition-transform"
                      >
                        Square up
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Per-member net balances */}
        <section className="flex flex-col gap-4">
          <h3 className="font-body text-[16px] font-semibold text-neutral-600">Balances</h3>
          <div className="flex flex-col gap-4">
            {members.map((m) => {
              const isMe = m.user_id === me?.id;
              const net = m.net_paise;
              return (
                <div key={m.user_id} className="flex items-center gap-3">
                  <Avatar name={name(m.user_id)} size={49} me={isMe} />
                  <span className="flex-1 font-body text-[16px] font-bold text-ink">{isMe ? 'You' : name(m.user_id)}</span>
                  <span className={`font-body text-[16px] font-extrabold tnum ${net === 0 ? 'text-neutral-600' : net > 0 ? 'text-teal' : 'text-primary'}`}>
                    {net === 0 ? '—' : `${net > 0 ? '+' : '-'}${rupees(Math.abs(net))}`}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="font-caption text-caption text-neutral-600">Positive means the group owes them; negative means they owe the group.</p>
        </section>

        {/* Category insight */}
        {catBreakdown.rows.length > 0 && (
          <section className="flex flex-col gap-4 pb-2">
            <h3 className="font-body text-[16px] font-semibold text-neutral-600">Where the money went</h3>
            <div className="flex flex-col gap-4">
              {catBreakdown.rows.map((c) => {
                const pct = catBreakdown.grand > 0 ? Math.round((c.total / catBreakdown.grand) * 100) : 0;
                return (
                  <div key={c.label} className="flex items-center gap-3">
                    <span className="w-[42px] h-[42px] rounded-xl bg-surface shadow-soft text-primary flex items-center justify-center shrink-0">
                      <Icon name={c.icon} style={{ fontSize: 22 }} />
                    </span>
                    <div className="flex flex-col flex-1 min-w-0 gap-1">
                      <div className="flex justify-between items-baseline">
                        <span className="font-body text-[15px] font-bold text-ink">{c.label}</span>
                        <span className="font-body text-[12.5px] font-semibold text-neutral-600 tnum">{rupees0(c.total)} · {pct}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-surface-container overflow-hidden">
                        <div className={`h-full rounded-full ${c.bar} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        </>)}
      </main>
    </div>
  );
}
