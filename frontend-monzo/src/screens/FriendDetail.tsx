import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '../api.js';
import { useStore } from '../store.js';
import { useCached } from '../cache.js';
import { rupees } from '../format.js';
import { Avatar, Icon, categoryStyle } from '../ui.js';
import { PageBanner } from '../banners.js';
import { RowSkeletons } from '../skeletons.js';
import { shareInvite } from '../invite.js';

// Per-friend view of non-group ("personal") splits — the friend analog of
// GroupDetail. Lists shared personal expenses (each editable via ExpenseDetail)
// and the running pairwise balance, with Settle up / Add expense actions.
export function FriendDetail() {
  const { id } = useParams();
  const friendId = Number(id);
  const nav = useNavigate();
  const { me, name } = useStore();

  // Resolve the friend directly (not via the store's cached directory, which
  // can lag a just-added placeholder) so the name shows instead of "#<id>".
  const fu = useCached(`user:${friendId}`, () => apiClient.user(friendId));
  const ex = useCached(`personal-expenses:${friendId}`, () => apiClient.personalExpenses(friendId));
  // Same key as Home, so the pairwise balance is usually already in cache.
  const pb = useCached('personal-balances', () => apiClient.personalBalances());

  const friend = fu.data ?? null;
  const expenses = ex.loading ? null : ex.data ?? [];
  // + they owe me, − I owe them
  const net = pb.data?.counterparties.find((c) => c.user_id === friendId)?.net_paise ?? 0;

  const settled = net === 0;
  const label = useMemo(() => friend?.name?.trim() || name(friendId), [friend, name, friendId]);
  const pending = !!friend?.is_placeholder;

  async function invite() {
    if (friend) await shareInvite(friend, me?.name ?? '');
  }

  return (
    <div className="min-h-screen bg-paper pb-28">
      <PageBanner title={label} sub={pending ? 'Invite pending' : 'Personal splits'} />

      <main className="monzo-sheet mx-3 -mt-9 px-6 pb-8 flex flex-col gap-5">
        <span className="sheet-handle" />

        {/* Balance summary — hero number */}
        <section className="flex flex-col items-center text-center pt-5">
          <Avatar name={label} size={56} />
          {pb.loading ? (
            // Skeleton until the balance lands — "All square" must never flash
            // in front of someone who actually owes money.
            <>
              <span className="skeleton h-9 w-36 rounded-card mt-3" aria-hidden />
              <span className="skeleton h-3.5 w-44 rounded-full mt-2" aria-hidden />
            </>
          ) : (
            <>
              <span className={`font-heading text-[34px] leading-tight font-extrabold tracking-[-1px] tnum mt-3 ${settled ? 'text-neutral-600' : net > 0 ? 'text-ink' : 'text-primary'}`}>
                {settled ? 'All square' : rupees(Math.abs(net))}
              </span>
              <span className="font-body text-[15px] font-semibold text-neutral-600">
                {settled ? `You and ${label} are squared up` : net > 0 ? `${label} owes you` : `You owe ${label}`}
              </span>
            </>
          )}
        </section>

        {/* Invite: shown until the person signs in and claims their account. */}
        {pending && (
          <button onClick={invite} className="flex items-center justify-between gap-3 text-left active:scale-[0.98] transition-transform">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-[49px] h-[49px] rounded-xl bg-surface shadow-soft text-amber flex items-center justify-center shrink-0">
                <Icon name="schedule" fill style={{ fontSize: 24 }} />
              </span>
              <div className="flex flex-col min-w-0">
                <span className="font-body text-[16px] font-bold text-ink">Invite pending</span>
                <span className="font-body text-[12.5px] font-semibold text-neutral-600 truncate">{label} hasn't joined yet — send them a link.</span>
              </div>
            </div>
            <span className="px-5 h-9 rounded-full bg-primary text-on-primary font-body text-[14px] font-bold flex items-center gap-1.5 shrink-0 shadow-soft">
              <Icon name="share" style={{ fontSize: 16 }} />Invite
            </span>
          </button>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2.5">
          <button onClick={() => nav(`/add/personal/${friendId}`)} className="btn-coral justify-center gap-2 text-[17px]">
            <Icon name="add" style={{ fontSize: 22 }} />
            Add expense
          </button>
          {net < 0 && (
            <button
              onClick={() => nav(`/settle/personal/${friendId}`)}
              className="w-full h-[52px] bg-surface text-primary shadow-soft rounded-full font-heading text-[17px] font-bold active:scale-95 transition-transform"
            >
              Settle up
            </button>
          )}
        </div>

        {/* Personal expenses with this friend */}
        <h3 className="font-body text-[16px] font-semibold text-neutral-600 mt-1">Expenses</h3>
        {expenses === null && <RowSkeletons count={3} />}
        <div className={`flex flex-col gap-4 ${expenses === null ? 'hidden' : ''}`}>
          {(expenses ?? []).map((e) => {
            const cat = categoryStyle(e.category, e.description);
            const payer = e.shares.find((s) => s.paid_paise > 0);
            const iPaid = payer?.user_id === me?.id;
            const myShare = e.shares.find((s) => s.user_id === me?.id);
            const n = myShare?.net_paise ?? 0;
            return (
              <Link key={e.id} to={`/expense/${e.id}`} state={{ group: label }} className="flex items-center gap-3 active:scale-[0.98] transition-transform">
                <span className="w-[49px] h-[49px] shrink-0 rounded-xl bg-surface shadow-soft flex items-center justify-center text-primary">
                  <Icon name={cat.icon} style={{ fontSize: 26 }} />
                </span>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="font-body text-[16px] font-bold text-ink truncate">{e.description}</span>
                  <span className="font-body text-[12.5px] font-semibold text-neutral-600 truncate">
                    {iPaid ? 'You paid' : `Paid by ${payer ? name(payer.user_id) : '—'}`} {rupees(e.amount_paise)}
                  </span>
                </div>
                <span className={`font-body text-[16px] font-extrabold tnum shrink-0 ${n > 0 ? 'text-teal' : n < 0 ? 'text-primary' : 'text-neutral-600'}`}>
                  {n > 0 ? `+${rupees(n)}` : n < 0 ? `-${rupees(-n)}` : '—'}
                </span>
              </Link>
            );
          })}
          {expenses !== null && expenses.length === 0 && (
            <div className="py-6 flex flex-col items-center gap-2 text-neutral-600">
              <Icon name="receipt_long" style={{ fontSize: 28 }} />
              <p className="font-body text-[15px] font-semibold text-center">No expenses with {label} yet — add your first one above.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
