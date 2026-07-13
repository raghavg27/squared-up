import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { apiClient, type Expense } from '../api.js';
import { useStore } from '../store.js';
import { useCached } from '../cache.js';
import { friendlyError } from '../errors.js';
import { rupees, rupees0 } from '../format.js';
import { Icon, categoryStyle } from '../ui.js';
import { PageBanner } from '../banners.js';
import { RowSkeletons } from '../skeletons.js';
import { LoadErrorCard } from '../ErrorBoundary.js';

export function GroupExpenses() {
  const { id } = useParams();
  const gid = Number(id);
  const { me, name } = useStore();
  const [q, setQ] = useState('');

  // Shares cache keys with GroupDetail, so "View all" opens instantly.
  const g = useCached(`group:${gid}`, () => apiClient.group(gid));
  const ex = useCached(`expenses:${gid}`, () => apiClient.expenses(gid));
  const group = g.data ?? null;
  const expenses = ex.loading ? null : ex.data ?? null;

  const months = useMemo(() => {
    const list = (expenses ?? []).filter((e) => e.description.toLowerCase().includes(q.trim().toLowerCase()));
    const map = new Map<string, { label: string; items: Expense[]; total: number }>();
    for (const e of list) {
      const key = (e.expense_date ?? e.created_at).slice(0, 7);
      if (!map.has(key)) {
        const label = new Date(key + '-01').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
        map.set(key, { label, items: [], total: 0 });
      }
      const b = map.get(key)!;
      b.items.push(e);
      b.total += e.amount_paise;
    }
    return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([, v]) => v);
  }, [expenses, q]);

  return (
    <div className="min-h-screen pb-10 bg-paper page-enter">
      <PageBanner title={group?.name ?? 'Expenses'} sub="All expenses" />

      <main className="monzo-sheet mx-3 -mt-9 px-6 pb-8 flex flex-col gap-4">
        <span className="sheet-handle" />

        {/* Monzo search row */}
        <div className="mt-4">
          <div className="flex items-center gap-3">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="flex-1 bg-transparent outline-none font-body text-[15px] text-ink placeholder:text-outline"
              placeholder="Search expenses"
            />
            <Icon name="search" className="text-outline" style={{ fontSize: 24 }} />
          </div>
          <div className="h-px bg-neutral-100 mt-3" />
        </div>

        {expenses === null && ex.error === undefined && <RowSkeletons count={5} />}

        {ex.error !== undefined && expenses === null && (
          <LoadErrorCard
            message={friendlyError(ex.error, "Couldn't load these expenses — give it another try.")}
            onRetry={ex.refresh}
          />
        )}

        {months.map((m) => (
          <section key={m.label} className="flex flex-col gap-4">
            <div className="flex items-baseline justify-between mt-2">
              <h3 className="font-body text-[16px] font-semibold text-neutral-600">{m.label}</h3>
              <span className="font-body text-[13px] font-semibold text-outline tnum">{rupees0(m.total)} total</span>
            </div>
            {m.items.map((e) => {
              const cat = categoryStyle(e.category, e.description);
              const payer = e.shares.find((s) => s.paid_paise > 0);
              const net = e.shares.find((s) => s.user_id === me?.id)?.net_paise ?? 0;
              const day = new Date(e.expense_date ?? e.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
              return (
                <Link key={e.id} to={`/expense/${e.id}`} state={{ group: group?.name }} className="flex items-center gap-3 active:scale-[0.98] transition-transform">
                  <span className="w-[49px] h-[49px] shrink-0 rounded-xl bg-surface shadow-soft flex items-center justify-center text-primary">
                    <Icon name={cat.icon} style={{ fontSize: 26 }} />
                  </span>
                  <div className="flex flex-col flex-1 min-w-0">
                    <span className="font-body text-[16px] font-bold text-ink truncate">{e.description}</span>
                    <span className="font-body text-[12.5px] font-semibold text-neutral-600 truncate">
                      {day} · {payer?.user_id === me?.id ? 'You paid' : `${payer ? name(payer.user_id) : '—'} paid`} {rupees(e.amount_paise)}
                    </span>
                  </div>
                  <span className={`font-body text-[16px] font-extrabold tnum shrink-0 ${net > 0 ? 'text-teal' : net < 0 ? 'text-primary' : 'text-neutral-600'}`}>
                    {net > 0 ? `+${rupees0(net)}` : net < 0 ? `-${rupees0(-net)}` : '—'}
                  </span>
                </Link>
              );
            })}
          </section>
        ))}

        {expenses !== null && months.length === 0 && (
          <div className="border-2 border-dashed border-neutral-300 rounded-card py-10 flex flex-col items-center gap-2 text-neutral-600 mt-4">
            <Icon name="receipt_long" style={{ fontSize: 28 }} />
            <p className="font-body text-[15px] font-semibold">{q ? 'Nothing matches that search.' : 'No expenses yet.'}</p>
          </div>
        )}
      </main>
    </div>
  );
}
