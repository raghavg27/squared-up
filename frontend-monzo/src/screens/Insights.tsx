import { useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api.js';
import { useStore } from '../store.js';
import { useCached } from '../cache.js';
import { friendlyError } from '../errors.js';
import { rupees, rupees0, signedRupees } from '../format.js';
import { Icon } from '../ui.js';
import { CoralBanner } from '../banners.js';
import { LoadErrorCard } from '../ErrorBoundary.js';
import { CategoryDonut, MonthlyBars, GroupBars, StatTile, catColor, catIcon } from '../charts.js';

const RANGES = [3, 6, 12];

export function Insights() {
  const { groups } = useStore();
  const [months, setMonths] = useState(6);
  const [groupId, setGroupId] = useState<number | undefined>(undefined);

  // Cached per scope+range, so flipping 3M/6M/12M back and forth is instant.
  const an = useCached(`analytics:${months}:${groupId ?? 'all'}`, () => apiClient.analytics(months, groupId));
  const { data, loading } = an;

  const t = data?.totals;
  // A fetch failure is an error card, never a misleading "no spending" state.
  const empty = !loading && an.error === undefined && (!data || data.totals.expense_count === 0);

  return (
    <div className="min-h-screen pb-28 bg-paper">
      <CoralBanner title="Insights" sub="Where your money goes" />
      <main className="monzo-sheet mx-3 -mt-9 px-6 pb-8 flex flex-col gap-4">
        <span className="sheet-handle" />
        <div className="pt-4" />

        {/* scope + range controls (one row above the charts) */}
        <div className="flex items-center gap-2 overflow-x-auto hide-scrollbar -mx-1 px-1">
          <select
            value={groupId ?? ''}
            onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : undefined)}
            className="shrink-0 bg-surface-container rounded-full px-3.5 h-9 font-body text-[13px] font-medium text-ink outline-none"
            aria-label="Scope"
          >
            <option value="">All spending</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <div className="shrink-0 bg-neutral-100 rounded-full p-0.5 flex">
            {RANGES.map((m) => (
              <button
                key={m}
                onClick={() => setMonths(m)}
                className={`h-8 px-3.5 rounded-full font-body text-[13px] font-semibold transition-colors ${months === m ? 'bg-surface-container-lowest text-primary card-shadow' : 'text-secondary'}`}
              >
                {m}M
              </button>
            ))}
          </div>
        </div>

        {loading && <Skeletons />}

        {an.error !== undefined && (
          <LoadErrorCard
            message={friendlyError(an.error, "Couldn't load your insights — give it another try.")}
            onRetry={an.refresh}
          />
        )}

        {empty && (
          <div className="border border-dashed border-neutral-300 rounded-card py-12 flex flex-col items-center gap-2 text-neutral-600 mt-2">
            <Icon name="monitoring" style={{ fontSize: 30 }} />
            <span className="font-body text-[15px]">No spending in this range yet</span>
            <span className="font-caption text-caption text-center px-8">Add a few expenses and your charts will fill in here.</span>
          </div>
        )}

        {!loading && data && !empty && t && (
          <>
            {/* headline stat tiles */}
            <div className="grid grid-cols-2 gap-3">
              <StatTile label="You spent" value={rupees0(t.spent_paise)} sub={`${t.expense_count} expenses`} />
              <StatTile label="You paid" value={rupees0(t.paid_paise)} />
              <StatTile
                label={t.net_paise >= 0 ? 'Net — you lent' : 'Net — you borrowed'}
                value={signedRupees(t.net_paise)}
                tone={t.net_paise >= 0 ? 'success' : 'danger'}
              />
              <StatTile label="Avg / expense" value={rupees0(t.avg_paise)} />
            </div>

            {/* category donut */}
            <Card title="By category">
              <CategoryDonut data={data.by_category} centerLabel="Total spent" centerValue={t.spent_paise} />
            </Card>

            {/* monthly trend */}
            <Card title="Monthly trend">
              <MonthlyBars data={data.by_month} />
            </Card>

            {/* by group (only meaningful across all groups) */}
            {groupId === undefined && data.by_group.length > 0 && (
              <Card title="By group">
                <GroupBars data={data.by_group} />
              </Card>
            )}

            {/* biggest expenses */}
            {data.top_expenses.length > 0 && (
              <Card title="Biggest expenses">
                <ul className="flex flex-col gap-3">
                  {data.top_expenses.map((e) => (
                    <li key={e.id}>
                      <Link to={`/expense/${e.id}`} className="flex items-center gap-3 active:scale-[0.99] transition-transform">
                        <span
                          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                          style={{ background: catColor(e.category) + '22', color: catColor(e.category) }}
                        >
                          <Icon name={catIcon(e.category)} style={{ fontSize: 18 }} />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block font-body text-[15px] text-ink truncate">{e.description}</span>
                          <span className="block font-caption text-caption text-secondary">{e.category} · {e.expense_date}</span>
                        </span>
                        <span className="font-currency text-[14px] text-ink tnum shrink-0">{rupees(e.your_share_paise)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="pt-2">
      <h3 className="font-body text-[16px] font-semibold text-neutral-600 mb-3">{title}</h3>
      {children}
    </section>
  );
}

function Skeletons() {
  return (
    <div className="flex flex-col gap-4 mt-1">
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-16 rounded-card" />)}
      </div>
      <div className="skeleton h-44 rounded-card" />
      <div className="skeleton h-52 rounded-card" />
    </div>
  );
}
