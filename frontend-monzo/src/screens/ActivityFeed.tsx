import { useEffect, useMemo, useState } from 'react';
import { apiClient, type ActivityEvent } from '../api.js';
import { useStore } from '../store.js';
import { rupees } from '../format.js';
import { Icon } from '../ui.js';
import { CoralBanner } from '../banners.js';

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
      <CoralBanner title="Activity" sub="Everything that moved money" />

      <main className="monzo-sheet mx-3 -mt-9 px-6 pb-8">
        <span className="sheet-handle" />

        {/* Monzo search row: borderless, magnifier on the right */}
        <div className="flex items-center gap-3 mt-8">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 bg-transparent outline-none font-body text-[15px] text-ink placeholder:text-outline"
            placeholder="Search..."
          />
          <Icon name="search" className="text-outline" style={{ fontSize: 24 }} />
        </div>
        <div className="h-px bg-neutral-100 mt-3" />

        {grouped.map(([label, items]) => (
          <div key={label} className="flex flex-col gap-4 mt-6">
            <h3 className="font-body text-[16px] font-semibold text-neutral-600">{label}</h3>
            {items.map(({ r }) => (
              <div key={r.id} className="flex items-center gap-3">
                <span className="w-[49px] h-[49px] shrink-0 rounded-xl bg-surface shadow-soft flex items-center justify-center text-primary">
                  <Icon name={r.icon} style={{ fontSize: 26 }} />
                </span>
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="font-body text-[16px] font-bold text-ink leading-snug">{r.title}</span>
                  <span className="font-body text-[12.5px] font-semibold text-neutral-600 truncate">{r.sub}</span>
                </div>
                {r.amount !== undefined && (
                  <div className="flex flex-col items-end shrink-0 pl-2">
                    <span className={`font-body text-[16px] font-extrabold tnum ${r.noteColor === 'text-success' ? 'text-teal' : 'text-ink'}`}>
                      {r.noteColor === 'text-success' ? '+' : r.note === 'You paid' ? '-' : ''}{rupees(r.amount)}
                    </span>
                    <span className={`text-[11px] font-semibold ${r.noteColor === 'text-success' ? 'text-teal' : 'text-neutral-600'}`}>{r.note}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
        {events.length === 0 && <p className="text-neutral-600 font-body text-[15px] text-center py-10">No activity yet.</p>}
      </main>
    </div>
  );
}
