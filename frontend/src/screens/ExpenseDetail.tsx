import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { apiClient, ApiError, type Comment, type Expense } from '../api.js';
import { useStore } from '../store.js';
import { rupees } from '../format.js';
import { Avatar, Icon, categoryFor, groupTypeStyle } from '../ui.js';

export function ExpenseDetail() {
  const { id } = useParams();
  const expId = Number(id);
  const loc = useLocation();
  const nav = useNavigate();
  const { me, name, groups } = useStore();
  const stateExpense = (loc.state as { expense?: Expense; group?: string } | null)?.expense;
  const groupName = (loc.state as { group?: string } | null)?.group;
  const [exp, setExp] = useState<Expense | null>(stateExpense ?? null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [cErr, setCErr] = useState<string | null>(null);

  useEffect(() => {
    apiClient.comments(expId).then(setComments).catch(() => {});
  }, [expId]);

  async function postComment() {
    const body = draft.trim();
    if (!body || posting) return;
    setPosting(true); setCErr(null);
    try {
      const c = await apiClient.addComment(expId, body);
      setComments((cs) => [...cs, c]);
      setDraft('');
    } catch (e) { setCErr(e instanceof ApiError ? e.message : 'Could not post comment'); }
    finally { setPosting(false); }
  }

  useEffect(() => {
    if (exp) return;
    // Deep-link fallback: scan groups for the expense.
    (async () => {
      for (const g of groups) {
        const es = await apiClient.expenses(g.id).catch(() => []);
        const found = es.find((e) => e.id === expId);
        if (found) { setExp(found); return; }
      }
    })();
  }, [exp, expId, groups]);

  if (!exp) {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center text-neutral-600 font-body">Loading…</div>
    );
  }

  const cat = categoryFor(exp.description);
  const payer = exp.shares.find((s) => s.paid_paise > 0);
  const grp = groups.find((g) => g.id === exp.group_id);
  const gName = groupName ?? grp?.name ?? 'Group';
  const gStyle = groupTypeStyle(grp?.type ?? 'other');
  const date = new Date(exp.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="min-h-screen bg-paper pb-10">
      <header className="flex items-center justify-between px-mobile py-3 border-b border-neutral-100">
        <button onClick={() => nav(-1)} className="w-10 h-10 flex items-center justify-center text-ink active:scale-95 transition-transform">
          <Icon name="arrow_back" />
        </button>
        <h1 className="font-heading text-[22px] font-bold text-ink">Expense Detail</h1>
        <button onClick={() => nav(`/expense/${expId}/edit`)} className="w-10 h-10 flex items-center justify-center text-ink active:scale-95 transition-transform">
          <Icon name="edit" style={{ fontSize: 22 }} />
        </button>
      </header>

      <div className="flex flex-col items-center text-center px-mobile mt-6">
        <div className={`w-16 h-16 rounded-card flex items-center justify-center ${cat.tint} ${cat.fg}`}>
          <Icon name={cat.icon} fill style={{ fontSize: 30 }} />
        </div>
        <h2 className="font-heading text-[22px] font-semibold text-ink mt-3">{exp.description}</h2>
        <p className="font-body text-[15px] text-on-surface-variant mt-1">Added by {payer ? name(payer.user_id) : '—'} on {date}</p>
        <p className="font-heading text-[40px] font-bold text-ink tnum mt-2">{rupees(exp.amount_paise)}</p>
      </div>

      <main className="px-mobile flex flex-col gap-4 mt-6">
        {/* Who Paid */}
        <Card icon="credit_card" title="Who Paid">
          <Row>
            <div className="flex items-center gap-3">
              <Avatar name={payer ? name(payer.user_id) : ''} size={36} me={payer?.user_id === me?.id} />
              <span className="font-body text-[17px] text-ink">{payer?.user_id === me?.id ? 'You' : (payer ? name(payer.user_id) : '—')}</span>
            </div>
            <span className="font-currency text-[17px] text-ink tnum">{rupees(payer?.paid_paise ?? 0)}</span>
          </Row>
        </Card>

        {/* Group */}
        <Card icon="group" title="Group">
          <Row>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-button flex items-center justify-center bg-tertiary text-white`}>
                <Icon name={gStyle.icon} fill style={{ fontSize: 22 }} />
              </div>
              <div className="flex flex-col">
                <span className="font-heading text-[17px] font-semibold text-ink">{gName}</span>
                <span className="font-caption text-caption text-on-surface-variant">{grp?.members.length ?? exp.shares.length} members</span>
              </div>
            </div>
          </Row>
        </Card>

        {/* Split Breakdown */}
        <Card icon="receipt_long" title="Split Breakdown">
          <div className="divide-y divide-neutral-100">
            {exp.shares.map((s) => {
              const gets = s.net_paise > 0;
              const isMe = s.user_id === me?.id;
              return (
                <div key={s.user_id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={name(s.user_id)} size={36} me={isMe} />
                    <div className="flex flex-col">
                      <span className="font-body text-[17px] text-ink">{isMe ? 'You' : name(s.user_id)}</span>
                      <span className={`font-caption text-caption font-medium ${gets ? 'text-success' : 'text-primary'}`}>
                        {gets ? 'Gets back' : isMe ? 'Owe' : 'Owes'}
                      </span>
                    </div>
                  </div>
                  <span className="font-currency text-[17px] text-ink tnum">{rupees(gets ? s.net_paise : s.owed_paise)}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Comments */}
        <Card icon="chat_bubble" title="Comments">
          {comments.length === 0 ? (
            <p className="text-center font-body text-[15px] text-on-surface-variant py-4">No comments yet.</p>
          ) : (
            <div className="flex flex-col gap-3 py-2">
              {comments.map((c) => {
                const isMe = c.user_id === me?.id;
                const when = new Date(c.created_at).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
                return (
                  <div key={c.id} className="flex items-start gap-3">
                    <Avatar name={name(c.user_id)} size={32} me={isMe} />
                    <div className="flex flex-col min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="font-heading text-[15px] font-semibold text-ink">{isMe ? 'You' : name(c.user_id)}</span>
                        <span className="font-caption text-caption text-on-surface-variant">{when}</span>
                      </div>
                      <span className="font-body text-[15px] text-ink break-words whitespace-pre-wrap">{c.body}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {cErr && <p className="text-primary font-caption text-caption mt-2">{cErr}</p>}
          <div className="flex items-center gap-2 mt-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && postComment()}
              className="input-warm flex-1"
              placeholder="Add a comment…"
            />
            <button
              onClick={postComment}
              disabled={posting || !draft.trim()}
              className="w-11 h-11 shrink-0 rounded-button bg-primary text-on-primary flex items-center justify-center active:scale-95 transition-transform disabled:opacity-50"
            >
              <Icon name="send" style={{ fontSize: 20 }} />
            </button>
          </div>
        </Card>
      </main>
    </div>
  );
}

function Card({ icon, title, children }: { icon: string; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface-container-lowest rounded-card p-4 border border-neutral-300 card-shadow">
      <div className="flex items-center gap-2 text-ink mb-1">
        <Icon name={icon} className="text-secondary" style={{ fontSize: 22 }} />
        <h3 className="font-heading text-[17px] font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between pt-1">{children}</div>;
}
