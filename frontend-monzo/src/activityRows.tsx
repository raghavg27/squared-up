// Activity-event → display row: one renderer shared by the /activity screen
// and Home's "Recent activity" section, so every event type (expense
// add/edit/delete/restore, comments, settlements, member changes) reads the
// same everywhere.
import { type ActivityEvent } from './api.js';
import { rupees } from './format.js';
import { Icon } from './ui.js';

export interface ActivityRowData {
  id: number; icon: string; tint: string; fg: string;
  title: string; sub: string; amount?: number; note?: string; noteColor?: string; due?: boolean;
}

export function renderActivity(
  a: ActivityEvent,
  name: (id: number) => string,
  meId: number | undefined,
  groupName: (gid: unknown) => string | undefined,
): ActivityRowData {
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
    const included = typeof p.history_included === 'number' && p.history_included > 0
      ? ` · split into ${p.history_included} past expense${p.history_included === 1 ? '' : 's'}`
      : '';
    return { id: a.id, icon: 'group_add', tint: 'bg-surface-container-high', fg: 'text-secondary', title: `${actor} ${verb} ${who}`, sub: (gname ?? 'Group update') + included };
  }
  if (a.type.startsWith('group')) {
    const verb = a.type === 'group.archived' ? 'archived' : a.type === 'group.restored' ? 'restored' : 'created';
    return { id: a.id, icon: 'group_add', tint: 'bg-surface-container-high', fg: 'text-secondary', title: `${actor} ${verb} '${desc}'`, sub: verb === 'created' ? 'New group' : 'Group update' };
  }
  if (a.type === 'comment.created') {
    return { id: a.id, icon: 'chat_bubble', tint: 'bg-sky/10', fg: 'text-sky', title: `${actor} commented on ${desc || 'an expense'}`, sub: gname ?? 'Comment' };
  }
  if (a.type === 'expense.deleted') {
    return { id: a.id, icon: 'delete', tint: 'bg-surface-container-high', fg: 'text-secondary', title: `${actor} deleted ${desc || 'an expense'}`, sub: gname ?? 'Expense removed', amount: amt };
  }
  const verb = a.type === 'expense.updated' ? 'updated' : a.type === 'expense.restored' ? 'restored' : 'added';
  return { id: a.id, icon: 'receipt_long', tint: 'bg-secondary-container', fg: 'text-secondary', title: `${actor} ${verb} ${desc || 'an expense'}`, sub: gname ?? 'Expense', amount: amt };
}

export function activityBucket(iso: string): string {
  const d = new Date(iso); const now = new Date();
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = (day(now) - day(d)) / 86400000;
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return 'Earlier';
}

export function ActivityRow({ r }: { r: ActivityRowData }) {
  return (
    <div className="flex items-center gap-3">
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
          {r.note && <span className={`text-[11px] font-semibold ${r.noteColor === 'text-success' ? 'text-teal' : 'text-neutral-600'}`}>{r.note}</span>}
        </div>
      )}
    </div>
  );
}
