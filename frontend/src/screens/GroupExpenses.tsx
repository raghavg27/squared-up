import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiClient, type Expense, type Group } from '../api.js';
import { useStore } from '../store.js';
import { rupees, rupees0 } from '../format.js';
import { Icon, categoryFor } from '../ui.js';

export function GroupExpenses() {
  const { id } = useParams();
  const gid = Number(id);
  const nav = useNavigate();
  const { me, name } = useStore();
  const [group, setGroup] = useState<Group | null>(null);
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    apiClient.group(gid).then(setGroup).catch(() => {});
    apiClient.expenses(gid).then(setExpenses).catch(() => setExpenses([]));
  }, [gid]);

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
      <header className="bg-paper sticky top-0 z-40 flex items-center justify-between px-mobile py-3">
        <button onClick={() => nav(-1)} className="w-10 h-10 flex items-center justify-center text-primary active:scale-95 transition-transform">
          <Icon name="arrow_back" />
        </button>
        <h1 className="font-heading text-[22px] font-bold text-primary truncate px-2">{group?.name ?? 'Expenses'}</h1>
        <div className="w-10" />
      </header>

      <main className="px-mobile flex flex-col gap-4">
        <div className="relative">
          <Icon name="search" className="text-neutral-600 absolute left-4 top-1/2 -translate-y-1/2" style={{ fontSize: 22 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} className="input-warm pl-12" placeholder="Search expenses" />
        </div>

        {expenses === null && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-[76px] rounded-card" />)}
          </div>
        )}

        {months.map((m) => (
          <section key={m.label} className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between mt-2">
              <h3 className="font-heading text-[17px] font-bold text-ink">{m.label}</h3>
              <span className="font-currency text-[13px] text-neutral-600 tnum">{rupees0(m.total)} total</span>
            </div>
            <div className="bg-surface-container-lowest rounded-card border border-neutral-300 card-shadow divide-y divide-neutral-100">
              {m.items.map((e) => {
                const cat = categoryFor(e.description);
                const payer = e.shares.find((s) => s.paid_paise > 0);
                const net = e.shares.find((s) => s.user_id === me?.id)?.net_paise ?? 0;
                const day = new Date(e.expense_date ?? e.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
                return (
                  <Link key={e.id} to={`/expense/${e.id}`} state={{ group: group?.name }} className="p-4 flex items-center justify-between active:bg-surface-container-low transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-button flex items-center justify-center shrink-0 ${cat.tint} ${cat.fg}`}>
                        <Icon name={cat.icon} fill style={{ fontSize: 20 }} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="font-heading text-[15px] font-semibold text-ink truncate">{e.description}</span>
                        <span className="font-caption text-caption text-neutral-600 truncate">
                          {day} • {payer?.user_id === me?.id ? 'You paid' : `${payer ? name(payer.user_id) : '—'} paid`}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col items-end shrink-0 pl-2">
                      <span className="font-currency text-[15px] text-ink tnum">{rupees(e.amount_paise)}</span>
                      <span className={`text-[11px] font-medium ${net > 0 ? 'text-success' : net < 0 ? 'text-primary' : 'text-neutral-600'}`}>
                        {net > 0 ? `Lent ${rupees0(net)}` : net < 0 ? `Borrowed ${rupees0(-net)}` : 'Squared up'}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}

        {expenses !== null && months.length === 0 && (
          <div className="border border-dashed border-neutral-300 rounded-card py-10 flex flex-col items-center gap-2 text-neutral-600 mt-4">
            <Icon name="receipt_long" style={{ fontSize: 28 }} />
            <p className="font-body text-[15px]">{q ? 'Nothing matches that search.' : 'No expenses yet.'}</p>
          </div>
        )}
      </main>
    </div>
  );
}
