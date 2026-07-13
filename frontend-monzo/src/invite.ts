// Building + sharing the deep-link an invited person opens to join Squared Up.
// The link carries their contact (phone/email) so the login screen can pre-fill
// it, and their name so onboarding can. Because we also create a placeholder
// user with that same normalized contact, the invitee dedupes onto it when they
// sign in (verify-otp keys on phone; Google login keys on email) — inheriting
// the groups, friendships and balances already tracked on their behalf.
import { shareText, type ShareOutcome } from './share.js';
import type { User } from './api.js';

export function inviteLink(opts: { name?: string | null; phone?: string | null; email?: string | null }): string {
  const p = new URLSearchParams({ invite: '1' });
  if (opts.name) p.set('name', opts.name);
  if (opts.phone) p.set('phone', opts.phone);
  if (opts.email) p.set('email', opts.email);
  return `${window.location.origin}/login?${p.toString()}`;
}

function inviteMessage(link: string, theirName: string, myName: string, groupName?: string): string {
  const who = theirName.trim().split(/\s+/)[0] || 'there';
  const from = myName.trim().split(/\s+/)[0] || 'A friend';
  const ctx = groupName ? ` to split expenses for ${groupName}` : ' to split shared expenses';
  return (
    `Hi ${who}, ${from} invited you to Squared Up${ctx} 👋\n\n` +
    `Join here: ${link}\n\n` +
    `— Squared Up, keeping shared expenses fair and friendly.`
  );
}

// Open the native share sheet (WhatsApp/SMS) with a join link for `u`, falling
// back to clipboard where the Web Share API is unavailable.
export function shareInvite(u: User, myName: string, groupName?: string): Promise<ShareOutcome> {
  const link = inviteLink({ name: u.name, phone: u.phone, email: u.email });
  return shareText(inviteMessage(link, u.name || 'there', myName, groupName), 'Join me on Squared Up');
}
