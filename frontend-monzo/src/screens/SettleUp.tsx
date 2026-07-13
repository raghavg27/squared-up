import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient, type Group, type SettlementResult } from '../api.js';
import { friendlyError } from '../errors.js';
import { useStore } from '../store.js';
import { rupees } from '../format.js';
import { Avatar, Icon } from '../ui.js';
import { PageBanner } from '../banners.js';
import { preferredIntent } from '../upiApp.js';

type Phase = 'idle' | 'paying' | 'awaiting' | 'done';

export function SettleUp() {
  const { groupId, toUserId } = useParams();
  const personal = groupId === 'personal';
  const gid = personal ? null : Number(groupId);
  const toId = Number(toUserId);
  const { me, userMap, name } = useStore();
  const nav = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [pending, setPending] = useState<SettlementResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const toUser = userMap.get(toId);
  const backTo = personal ? '/' : `/groups/${gid}`;

  useEffect(() => {
    if (personal) {
      apiClient.personalBalances().then((b) => {
        const c = b.counterparties.find((x) => x.user_id === toId);
        // Negative net = I owe them; that's what I can settle here.
        setAmount(c && c.net_paise < 0 ? -c.net_paise : 0);
      }).catch(() => setAmount(0));
      return;
    }
    apiClient.group(gid!).then(setGroup).catch(() => {});
    apiClient.balances(gid!).then((b) => {
      const s = b.simplified_settlements.find((x) => x.from_user === me?.id && x.to_user === toId);
      setAmount(s?.amount_paise ?? 0);
    }).catch(() => setAmount(0));
  }, [gid, toId, me, personal]);

  const finish = () => {
    setPhase('done');
    if (navigator.vibrate) navigator.vibrate(30);
    setTimeout(() => nav(backTo, { replace: true }), 1400);
  };

  // UPI: create the settlement, hand off to the UPI app, then ask the user to
  // confirm when they come back — we never assume the payment went through.
  async function payUpi() {
    if (phase !== 'idle' || !me || !amount) return;
    setPhase('paying'); setErr(null);
    try {
      const r = await apiClient.createSettlement({
        group_id: gid, from_user: me.id, to_user: toId,
        amount_paise: amount, method: 'upi',
        note: `Squaring up: ${personal ? name(toId) : (group?.name ?? 'Squared Up')}`,
      });
      setPending(r);
      if (r.upi_intent) {
        window.location.href = preferredIntent(r.upi_intent);
        setPhase('awaiting');
      } else {
        // Creditor has no UPI ID on file — fall back to marking manually.
        setPhase('awaiting');
      }
    } catch (e) {
      setErr(friendlyError(e, "That didn't go through — try again"));
      setPhase('idle');
    }
  }

  // Cash / bank transfer outside the app: record + confirm in one step.
  async function payManual() {
    if (phase !== 'idle' || !me || !amount) return;
    setPhase('paying'); setErr(null);
    try {
      const r = await apiClient.createSettlement({
        group_id: gid, from_user: me.id, to_user: toId,
        amount_paise: amount, method: 'manual', note: 'Marked as paid',
      });

      await apiClient.confirmSettlement(r.id);
      finish();
    } catch (e) {
      setErr(friendlyError(e, "That didn't go through — try again"));
      setPhase('idle');
    }
  }

  async function confirmPaid() {
    if (!pending) return;
    try { await apiClient.confirmSettlement(pending.id); finish(); }
    catch (e) { setErr(friendlyError(e, 'Could not confirm — try again')); }
  }

  const loading = amount === null;
  const nothingToSettle = amount === 0;

  return (
    <div className="min-h-screen bg-paper flex flex-col page-enter">
      <PageBanner title="Square Up" sub={personal ? name(toId) : group?.name} />

      <main className="monzo-sheet mx-3 -mt-9 px-6 pb-8 flex-1 flex flex-col">
        <span className="sheet-handle" />

        <div className="flex flex-col items-center text-center pt-7">
          <div className="rounded-full shadow-soft">
            <Avatar name={toUser?.name ?? name(toId)} size={96} />
          </div>
          {loading ? (
            <div className="skeleton h-12 w-40 rounded-card mt-5" />
          ) : (
            <span className="font-heading text-[44px] leading-tight font-extrabold text-ink tracking-[-1.5px] tnum mt-4">{rupees(amount)}</span>
          )}
          <p className="font-body text-[15px] font-semibold text-neutral-600 mt-1">
            {nothingToSettle
              ? `You're all square with ${name(toId)}${personal ? '' : ` in ${group?.name ?? 'this group'}`} 🎉`
              : <>You owe {name(toId)}{personal ? '' : <> for {group?.name ?? '…'}</>}</>}
          </p>
        </div>

        {phase === 'done' && (
          <div className="mt-8 flex flex-col items-center gap-2 text-teal">
            <div className="w-16 h-16 rounded-full bg-teal/15 flex items-center justify-center pop-in">
              <Icon name="check" fill style={{ fontSize: 34 }} />
            </div>
            <p className="font-heading text-[17px] font-bold pop-in">Squared up!</p>
          </div>
        )}

        {phase === 'awaiting' && (
          <div className="mt-8 flex flex-col items-center gap-4 page-enter">
            <p className="font-body text-[17px] font-semibold text-ink text-center">Did the payment go through?</p>
            <button onClick={confirmPaid} className="btn-coral justify-center text-[17px]">
              Yes, mark as squared up
            </button>
            {pending?.upi_intent && (
              <button onClick={() => { window.location.href = preferredIntent(pending.upi_intent!); }} className="font-body text-[15px] text-primary font-bold">
                Reopen UPI app
              </button>
            )}
            <button onClick={() => nav(backTo, { replace: true })} className="font-body text-[15px] font-semibold text-neutral-600">
              Not yet — I'll confirm later
            </button>
          </div>
        )}

        {(phase === 'idle' || phase === 'paying') && !nothingToSettle && !loading && (
          <div className="mt-auto pt-8">
            <button onClick={payUpi} disabled={phase === 'paying'} className="btn-coral">
              <span>{phase === 'paying' ? 'Opening UPI…' : 'Pay via UPI'}</span>
              <Icon name="arrow_right_alt" style={{ fontSize: 30 }} />
            </button>
            {!toUser?.upi_vpa && (
              <p className="font-caption text-caption text-neutral-600 text-center mt-3">
                {name(toId)} hasn't added a UPI ID yet — pay them directly, then mark as paid.
              </p>
            )}
            <button onClick={payManual} disabled={phase === 'paying'} className="w-full text-center font-heading text-[16px] font-bold text-primary mt-5 disabled:opacity-60">
              Mark as paid manually
            </button>
          </div>
        )}

        {nothingToSettle && (
          <button onClick={() => nav(-1)} className="w-full h-[52px] bg-surface shadow-soft text-ink rounded-full font-heading text-[17px] font-bold mt-8 active:scale-[0.98] transition-transform">
            Go back
          </button>
        )}

        {err && <p className="text-danger font-body text-[13px] font-semibold text-center mt-4">{err}</p>}
      </main>
    </div>
  );
}
