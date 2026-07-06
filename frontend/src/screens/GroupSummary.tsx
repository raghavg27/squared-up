import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient, type Balances, type Group } from '../api.js';
import { useStore } from '../store.js';
import { rupees } from '../format.js';
import { Avatar, Icon } from '../ui.js';

export function GroupSummary() {
  const { id } = useParams();
  const gid = Number(id);
  const nav = useNavigate();
  const { me, name } = useStore();
  const [group, setGroup] = useState<Group | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);

  useEffect(() => {
    apiClient.group(gid).then(setGroup).catch(() => {});
    apiClient.balances(gid).then(setBalances).catch(() => {});
  }, [gid]);

  const members = balances?.members ?? [];
  const settlements = balances?.simplified_settlements ?? [];
  const allSettled = members.every((m) => m.net_paise === 0);

  return (
    <div className="min-h-screen pb-10 bg-paper">
      <header className="flex items-center justify-between px-mobile py-3 border-b border-neutral-100">
        <button onClick={() => nav(-1)} className="w-10 h-10 flex items-center justify-center text-ink active:scale-95 transition-transform">
          <Icon name="arrow_back" />
        </button>
        <h1 className="font-heading text-[22px] font-bold text-ink">Balance Summary</h1>
        <div className="w-10" />
      </header>

      <main className="px-mobile flex flex-col gap-5 mt-4">
        <p className="font-body text-[15px] text-on-surface-variant">
          {group?.name ?? '…'} • {members.length} {members.length === 1 ? 'member' : 'members'}
        </p>

        {/* Who owes whom — the simplified settlement plan */}
        <section className="flex flex-col gap-3">
          <h3 className="font-heading text-[17px] font-bold text-ink">Who pays whom</h3>
          {allSettled ? (
            <div className="border border-dashed border-neutral-300 rounded-card py-10 flex flex-col items-center gap-2 text-tertiary">
              <Icon name="celebration" fill style={{ fontSize: 30 }} />
              <p className="font-body text-[15px] text-neutral-600">Everyone is settled up.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {settlements.map((s, i) => {
                const iPay = s.from_user === me?.id;
                const iReceive = s.to_user === me?.id;
                return (
                  <div key={i} className="bg-surface-container-lowest rounded-card p-4 border border-neutral-300 card-shadow flex items-center gap-3">
                    <Avatar name={name(s.from_user)} size={40} me={iPay} />
                    <div className="flex flex-col items-center text-neutral-600">
                      <span className="font-currency text-[15px] font-semibold text-ink tnum">{rupees(s.amount_paise)}</span>
                      <Icon name="arrow_forward" style={{ fontSize: 18 }} />
                    </div>
                    <Avatar name={name(s.to_user)} size={40} me={iReceive} />
                    <div className="flex flex-col flex-1 min-w-0">
                      <span className="font-body text-[15px] text-ink truncate">
                        <span className="font-semibold">{iPay ? 'You' : name(s.from_user)}</span> {iPay ? 'pay' : 'pays'} <span className="font-semibold">{iReceive ? 'you' : name(s.to_user)}</span>
                      </span>
                    </div>
                    {iPay && (
                      <button
                        onClick={() => nav(`/settle/${gid}/${s.to_user}`)}
                        className="px-4 h-9 shrink-0 rounded-button bg-primary text-on-primary font-body text-[15px] font-medium active:scale-95 transition-transform"
                      >
                        Settle
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Per-member net balances */}
        <section className="flex flex-col gap-3">
          <h3 className="font-heading text-[17px] font-bold text-ink">Balances</h3>
          <div className="bg-surface-container-lowest rounded-card border border-neutral-300 card-shadow divide-y divide-neutral-100">
            {members.map((m) => {
              const isMe = m.user_id === me?.id;
              const net = m.net_paise;
              return (
                <div key={m.user_id} className="p-3 flex items-center gap-3">
                  <Avatar name={name(m.user_id)} size={40} me={isMe} />
                  <span className="flex-1 font-body text-[17px] text-ink">{isMe ? 'You' : name(m.user_id)}</span>
                  <span className={`font-currency text-[15px] font-semibold tnum ${net === 0 ? 'text-neutral-600' : net > 0 ? 'text-success' : 'text-primary'}`}>
                    {net === 0 ? 'Settled' : `${net > 0 ? '+' : '-'}${rupees(Math.abs(net))}`}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="font-caption text-caption text-neutral-600">Positive means the group owes them; negative means they owe the group.</p>
        </section>
      </main>
    </div>
  );
}
