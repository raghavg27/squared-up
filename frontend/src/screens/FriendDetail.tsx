import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiClient, type Expense, type User } from '../api.js';
import { useStore } from '../store.js';
import { rupees } from '../format.js';
import { Avatar, Icon, categoryFor } from '../ui.js';
import { shareInvite } from '../invite.js';

// Per-friend view of non-group ("personal") splits — the friend analog of
// GroupDetail. Lists shared personal expenses (each editable via ExpenseDetail)
// and the running pairwise balance, with Settle up / Add expense actions.
export function FriendDetail() {
  const { id } = useParams();
  const friendId = Number(id);
  const nav = useNavigate();
  const { me, name } = useStore();
  const [friend, setFriend] = useState<User | null>(null);
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [net, setNet] = useState(0); // + they owe me, − I owe them

  useEffect(() => {
    // Resolve the friend directly (not via the store's cached directory, which
    // can lag a just-added placeholder) so the name shows instead of "#<id>".
    apiClient.user(friendId).then(setFriend).catch(() => setFriend(null));
    apiClient.personalExpenses(friendId).then(setExpenses).catch(() => setExpenses([]));
    apiClient.personalBalances()
      .then((b) => setNet(b.counterparties.find((c) => c.user_id === friendId)?.net_paise ?? 0))
      .catch(() => setNet(0));
  }, [friendId]);

  const settled = net === 0;
  const label = useMemo(() => friend?.name?.trim() || name(friendId), [friend, name, friendId]);
  const pending = !!friend?.is_placeholder;

  async function invite() {
    if (friend) await shareInvite(friend, me?.name ?? '');
  }

  return (
    <div className="min-h-screen bg-paper pb-28">
      <header className="flex items-center justify-between px-mobile py-3 border-b border-neutral-100">
        <button onClick={() => nav(-1)} className="w-10 h-10 flex items-center justify-center text-ink active:scale-95 transition-transform">
          <Icon name="arrow_back" />
        </button>
        <h1 className="font-heading text-[22px] font-bold text-ink truncate px-2">{label}</h1>
        <div className="w-10" />
      </header>

      <main className="px-mobile flex flex-col gap-4 mt-4">
        {/* Balance summary */}
        <section className="bg-surface-container-lowest rounded-card p-4 border border-neutral-300 card-shadow flex items-center gap-3">
          <Avatar name={label} size={52} />
          <div className="flex flex-col flex-1 min-w-0">
            <span className="font-caption text-caption text-neutral-600">{settled ? 'You are' : net > 0 ? `${label} owes you` : `You owe ${label}`}</span>
            <span className={`font-currency text-[22px] font-semibold tnum ${settled ? 'text-neutral-600' : net > 0 ? 'text-success' : 'text-primary'}`}>
              {settled ? 'All squared up' : rupees(Math.abs(net))}
            </span>
          </div>
        </section>

        {/* Invite: shown until the person signs in and claims their account. */}
        {pending && (
          <button
            onClick={invite}
            className="bg-amber/10 border border-amber/30 rounded-card p-3 flex items-center justify-between gap-3 text-left active:scale-[0.99] transition-transform"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-button bg-amber/15 text-amber flex items-center justify-center shrink-0">
                <Icon name="schedule" fill style={{ fontSize: 22 }} />
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-heading text-[15px] font-semibold text-ink">Invite pending</span>
                <span className="font-caption text-caption text-neutral-600 truncate">{label} hasn't joined yet — send them a link.</span>
              </div>
            </div>
            <span className="px-4 h-9 rounded-button bg-primary text-on-primary font-body text-[15px] font-medium flex items-center gap-1.5 shrink-0">
              <Icon name="share" style={{ fontSize: 18 }} />Invite
            </span>
          </button>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={() => nav(`/add/personal/${friendId}`)}
            className="flex-1 bg-primary text-on-primary h-[52px] rounded-button font-heading text-[17px] font-semibold active:scale-95 transition-transform flex items-center justify-center gap-1"
          >
            <Icon name="add" style={{ fontSize: 20 }} />
            Add expense
          </button>
          {net < 0 && (
            <button
              onClick={() => nav(`/settle/personal/${friendId}`)}
              className="flex-1 border border-neutral-900 text-ink h-[52px] rounded-button font-heading text-[17px] font-semibold active:scale-95 transition-transform"
            >
              Settle up
            </button>
          )}
        </div>

        {/* Personal expenses with this friend */}
        <h3 className="font-heading text-[17px] font-semibold text-ink mt-2">Expenses</h3>
        {expenses === null && (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-[72px] rounded-card" />)}
          </div>
        )}
        <div className={`bg-surface-container-lowest rounded-card border border-neutral-300 card-shadow divide-y divide-neutral-100 ${expenses === null ? 'hidden' : ''}`}>
          {(expenses ?? []).map((e) => {
            const cat = categoryFor(e.description);
            const payer = e.shares.find((s) => s.paid_paise > 0);
            const iPaid = payer?.user_id === me?.id;
            const myShare = e.shares.find((s) => s.user_id === me?.id);
            const n = myShare?.net_paise ?? 0;
            return (
              <Link key={e.id} to={`/expense/${e.id}`} state={{ group: label }} className="p-4 flex items-center justify-between active:bg-surface-container-low transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-10 h-10 rounded-button flex items-center justify-center shrink-0 ${cat.tint} ${cat.fg}`}>
                    <Icon name={cat.icon} fill style={{ fontSize: 22 }} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-heading text-[17px] font-semibold text-ink truncate">{e.description}</span>
                    <span className="font-caption text-caption text-neutral-600 truncate">{iPaid ? 'You paid' : `Paid by ${payer ? name(payer.user_id) : '—'}`}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end shrink-0 pl-2">
                  <span className="font-currency text-[17px] text-ink tnum">{rupees(e.amount_paise)}</span>
                  <span className={`text-[11px] font-medium ${n > 0 ? 'text-success' : n < 0 ? 'text-primary' : 'text-neutral-600'}`}>
                    {n > 0 ? `Lent ${rupees(n)}` : n < 0 ? `Borrowed ${rupees(-n)}` : 'Squared up'}
                  </span>
                </div>
              </Link>
            );
          })}
          {expenses !== null && expenses.length === 0 && (
            <div className="p-8 flex flex-col items-center gap-2 text-neutral-600">
              <Icon name="receipt_long" style={{ fontSize: 28 }} />
              <p className="font-body text-[15px] text-center">No expenses with {label} yet — add your first one above.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
