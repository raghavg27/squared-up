import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient, type Group, type SettlementResult } from '../api.js';
import { useStore } from '../store.js';
import { rupees } from '../format.js';
import { Avatar, Icon } from '../ui.js';
import { getUpiApp } from '../upiApp.js';

export function SettleUp() {
  const { groupId, toUserId } = useParams();
  const gid = Number(groupId);
  const toId = Number(toUserId);
  const { me, userMap, name } = useStore();
  const nav = useNavigate();
  const [group, setGroup] = useState<Group | null>(null);
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toUser = userMap.get(toId);
  const prefKey = getUpiApp().key;
  const APPS = [{ key: 'gpay', label: 'GPay' }, { key: 'phonepe', label: 'PhonePe' }, { key: 'paytm', label: 'Paytm' }];
  const orderedApps = [...APPS].sort((a, b) => (a.key === prefKey ? -1 : b.key === prefKey ? 1 : 0));

  useEffect(() => {
    apiClient.group(gid).then(setGroup).catch(() => {});
    apiClient.balances(gid).then((b) => {
      const s = b.simplified_settlements.find((x) => x.from_user === me?.id && x.to_user === toId);
      setAmount(s?.amount_paise ?? 0);
    }).catch(() => {});
  }, [gid, toId, me]);

  async function pay(manual: boolean) {
    if (busy || !me) return;
    setBusy(true); setErr(null);
    try {
      const r: SettlementResult = await apiClient.createSettlement({
        group_id: gid, from_user: me.id, to_user: toId,
        amount_paise: amount, method: manual ? 'cash' : 'upi', note: 'Squared Up',
      });
      if (!manual && r.upi_intent) window.location.href = r.upi_intent;
      await apiClient.confirmSettlement(r.id).catch(() => {});
      setDone(true);
      setTimeout(() => nav(`/groups/${gid}`, { replace: true }), 900);
    } catch (e) { setErr(String(e)); setBusy(false); }
  }

  return (
    <div className="min-h-screen bg-paper flex flex-col px-mobile">
      <header className="py-3">
        <button onClick={() => nav(-1)} className="w-10 h-10 flex items-center justify-center text-ink active:scale-95 transition-transform">
          <Icon name="close" />
        </button>
      </header>

      <div className="flex flex-col items-center text-center mt-8">
        <div className="rounded-full ring-4 ring-surface-container-lowest">
          <Avatar name={toUser?.name ?? ''} size={104} />
        </div>
        <h1 className="font-heading text-[32px] font-bold text-ink mt-5">Settle with {name(toId)}</h1>
        <p className="font-body text-[17px] text-on-surface-variant mt-2">
          You owe {name(toId)} <span className="font-currency font-medium text-ink tnum">{rupees(amount)}</span> for {group?.name ?? '…'}
        </p>
      </div>

      <div className="bg-surface-container-lowest rounded-card card-shadow border border-neutral-100 py-8 flex items-center justify-center mt-8">
        <span className="font-heading text-[40px] font-bold text-ink tnum">{rupees(amount)}</span>
      </div>

      {done ? (
        <div className="mt-8 flex flex-col items-center gap-2 text-tertiary">
          <div className="w-14 h-14 rounded-full bg-teal/15 flex items-center justify-center">
            <Icon name="check" fill style={{ fontSize: 30 }} />
          </div>
          <p className="font-heading text-[17px] font-semibold">Settled up!</p>
        </div>
      ) : (
        <>
          <button
            onClick={() => pay(false)}
            disabled={busy}
            className="w-full h-[52px] bg-primary text-on-primary rounded-button font-heading text-[17px] font-semibold flex items-center justify-center gap-2 mt-8 active:scale-[0.98] transition-transform disabled:opacity-60"
          >
            <Icon name="qr_code_2" style={{ fontSize: 22 }} />
            Pay via UPI
          </button>

          <div className="grid grid-cols-3 gap-3 mt-4">
            {orderedApps.map((p) => {
              const preferred = p.key === prefKey;
              return (
                <button
                  key={p.key}
                  onClick={() => pay(false)}
                  disabled={busy}
                  className={`h-[52px] rounded-button font-heading text-[15px] font-bold text-ink active:scale-95 transition-transform disabled:opacity-60 ${preferred ? 'border-2 border-primary bg-primary/5' : 'border border-neutral-300 bg-surface-container-lowest'}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <button onClick={() => pay(true)} disabled={busy} className="font-heading text-[17px] font-bold text-primary mt-6 disabled:opacity-60">
            Mark as paid manually
          </button>
        </>
      )}
      {err && <p className="text-danger font-body text-[13px] text-center mt-4">{err}</p>}
    </div>
  );
}
