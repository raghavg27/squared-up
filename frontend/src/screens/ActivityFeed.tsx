import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiClient, type ActivityEvent } from '../api.js';
import { useStore } from '../store.js';
import { rupees } from '../format.js';
import { Avatar, Icon } from '../ui.js';

interface Row {
  id: number; icon: string; tint: string; fg: string;
  title: string; sub: string; amount?: number; note?: string; noteColor?: string; due?: boolean;
}

function render(
  a: ActivityEvent,
  name: (id: number) => string,
  meId: number | undefined,
  groupName: (gid: unknown) => string | undefined,
): Row {
  const isMe = a.actor === meId;
  const actor = isMe ? 'You' : name(a.actor);
  const p = a.payload || {};
  const amt = typeof p.amount_paise === 'number' ? (p.amount_paise as number) : undefined;
  const desc = (p.description as string) || (p.name as string) || '';
  const gname = groupName(p.group_id);

  if (a.type.startsWith('settlement')) {
    const toMe = p.to === meId;
    const other = typeof p.to === 'number' ? (toMe ? 'you' : name(p.to as number)) : 'someone';
    const title =
      a.type === 'settlement.confirmed'
        ? `${actor} confirmed a payment to ${other}`
        : a.type === 'settlement.disputed'
          ? `${actor} disputed a payment to ${other}`
          : `${actor} paid ${other}`;
    return {
      id: a.id, icon: 'handshake', tint: 'bg-teal/15', fg: 'text-tertiary',
      title, sub: gname ?? 'Settlement', amount: amt,
      note: toMe ? 'You received' : isMe ? 'You paid' : undefined,
      noteColor: toMe ? 'text-success' : 'text-on-surface-variant',
    };
  }
  if (a.type === 'group.member_added' || a.type === 'group.member_removed') {
    const who = p.user_id === meId ? 'you' : typeof p.user_id === 'number' ? name(p.user_id as number) : 'someone';
    const verb = a.type.endsWith('added') ? 'added' : 'removed';
    return { id: a.id, icon: 'group_add', tint: 'bg-surface-container-high', fg: 'text-secondary', title: `${actor} ${verb} ${who}`, sub: gname ?? 'Group update' };
  }
  if (a.type.startsWith('group')) {
    return { id: a.id, icon: 'group_add', tint: 'bg-surface-container-high', fg: 'text-secondary', title: `${actor} created '${desc}'`, sub: 'New group' };
  }
  if (a.type === 'comment.created') {
    return { id: a.id, icon: 'chat_bubble', tint: 'bg-sky/10', fg: 'text-sky', title: `${actor} commented on ${desc || 'an expense'}`, sub: gname ?? 'Comment' };
  }
  if (a.type === 'expense.deleted') {
    return { id: a.id, icon: 'delete', tint: 'bg-surface-container-high', fg: 'text-secondary', title: `${actor} deleted ${desc || 'an expense'}`, sub: gname ?? 'Expense removed', amount: amt };
  }
  const verb = a.type === 'expense.updated' ? 'updated' : 'added';
  return { id: a.id, icon: 'receipt_long', tint: 'bg-secondary-container', fg: 'text-secondary', title: `${actor} ${verb} ${desc || 'an expense'}`, sub: gname ?? 'Expense', amount: amt };
}

function bucket(iso: string): string {
  const d = new Date(iso); const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (day(now) - day(d)) / 86400000;
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return 'Earlier';
}

export function ActivityFeed() {
  const { me, name, groups } = useStore();
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [q, setQ] = useState('');

  useEffect(() => { apiClient.activity().then(setEvents).catch(() => {}); }, []);

  const groupName = (gid: unknown) => (typeof gid === 'number' ? groups.find((g) => g.id === gid)?.name : undefined);

  const grouped = useMemo(() => {
    const rows = events
      .map((e) => ({ e, r: render(e, name, me?.id, groupName) }))
      .filter(({ r }) => r.title.toLowerCase().includes(q.toLowerCase()) || r.sub.toLowerCase().includes(q.toLowerCase()));
    const map = new Map<string, { e: ActivityEvent; r: Row }[]>();
    for (const item of rows) {
      const b = bucket(item.e.created_at);
      (map.get(b) ?? map.set(b, []).get(b)!).push(item);
    }
    return [...map.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, q, me]);

  return (
    <div className="min-h-screen pb-28 bg-paper">
      <header className="bg-paper sticky top-0 z-40 flex items-center justify-between px-mobile py-3">
        <div className="w-10 h-10 flex items-center justify-center text-primary"><Icon name="account_balance_wallet" style={{ fontSize: 24 }} /></div>
        <h1 className="font-heading text-[22px] font-bold text-primary">Squared Up</h1>
        <Link to="/profile"><Avatar name={me?.name ?? ''} size={36} /></Link>
      </header>

      <main className="px-mobile flex flex-col gap-4 stagger">
        <h2 className="font-heading text-[32px] font-bold text-ink mt-2">Activity</h2>

        <div className="relative">
          <Icon name="search" className="text-neutral-600 absolute left-4 top-1/2 -translate-y-1/2" style={{ fontSize: 22 }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} className="input-warm pl-12" placeholder="Search activity" />
        </div>

        {grouped.map(([label, items]) => (
          <div key={label} className="flex flex-col gap-3">
            <h3 className="font-body text-[15px] text-on-surface-variant mt-2">{label}</h3>
            {items.map(({ r }) => (
              <div key={r.id} className={`bg-surface-container-lowest rounded-card p-4 border border-neutral-300 card-shadow flex items-center justify-between ${r.due ? 'border-l-4 border-l-amber' : ''}`}>
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-11 h-11 rounded-button flex items-center justify-center shrink-0 ${r.tint} ${r.fg}`}>
                    <Icon name={r.icon} fill style={{ fontSize: 22 }} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="font-heading text-[17px] font-semibold text-ink leading-snug">{r.title}</span>
                    <span className="font-caption text-caption text-on-surface-variant">{r.sub}</span>
                  </div>
                </div>
                {r.amount !== undefined && (
                  <div className="flex flex-col items-end shrink-0 pl-2">
                    <span className={`font-currency text-[17px] tnum ${r.noteColor === 'text-success' ? 'text-success' : 'text-ink'}`}>
                      {r.noteColor === 'text-success' ? '+' : r.note === 'You paid' ? '-' : ''}{rupees(r.amount)}
                    </span>
                    <span className={`text-[11px] font-medium ${r.noteColor}`}>{r.note}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        {events.length === 0 && <p className="text-neutral-600 font-body text-[15px] text-center py-8">No activity yet.</p>}
      </main>
    </div>
  );
}
