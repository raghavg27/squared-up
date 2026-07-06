import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store.js';
import { Avatar, Icon } from '../ui.js';
import { getUpiApp } from '../upiApp.js';

export function Profile() {
  const { me, logout } = useStore();
  const nav = useNavigate();
  const [copied, setCopied] = useState(false);

  const copyVpa = () => {
    if (!me?.upi_vpa) return;
    navigator.clipboard?.writeText(me.upi_vpa).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="min-h-screen pb-28 bg-paper flex flex-col items-center px-mobile">
      <button onClick={() => nav('/profile/edit')} className="flex flex-col items-center mt-10 active:scale-[0.99] transition-transform">
        <div className="relative">
          {me?.name ? <Avatar name={me.name} size={112} /> : (
            <div className="w-28 h-28 rounded-full bg-surface-container-highest flex items-center justify-center text-neutral-300"><Icon name="account_circle" fill style={{ fontSize: 96 }} /></div>
          )}
          <span className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center border-2 border-paper">
            <Icon name="edit" style={{ fontSize: 16 }} />
          </span>
        </div>
        <h1 className="font-heading text-[22px] font-bold text-ink mt-4">{me?.name || 'Set up profile'}</h1>
        <p className="font-body text-[17px] text-on-surface-variant mt-1 tnum">{me?.phone ?? ''}</p>
      </button>
      {me?.upi_vpa && (
        <button onClick={copyVpa} className="mt-3 bg-surface-container flex items-center gap-2 px-4 py-2 rounded-full active:scale-95 transition-transform">
          <span className="font-currency text-[15px] font-medium text-ink">{me.upi_vpa}</span>
          <Icon name={copied ? 'check' : 'content_copy'} className="text-primary" style={{ fontSize: 18 }} />
        </button>
      )}

      <div className="w-full flex flex-col gap-4 mt-8">
        <SettingRow icon="group" title="Friends" sub="People you split with" onClick={() => nav('/friends')} />
        <SettingRow icon="receipt_long" title="Activity" sub="Your recent transactions" onClick={() => nav('/activity')} />
        <SettingRow icon="person" title="Edit profile" sub="Name, UPI ID, language" onClick={() => nav('/profile/edit')} />
        <SettingRow icon="account_balance_wallet" title="Primary UPI App" sub={getUpiApp().label} onClick={() => nav('/profile/upi-app')} />
      </div>

      <button
        onClick={() => { logout(); nav('/login', { replace: true }); }}
        className="w-full h-[56px] rounded-button border border-neutral-900 text-ink font-heading text-[17px] font-semibold flex items-center justify-center gap-2 mt-6 active:scale-[0.98] transition-transform"
      >
        <Icon name="logout" style={{ fontSize: 22 }} />
        Logout
      </button>
    </div>
  );
}

function SettingRow({ icon, title, sub, trailing, onClick }: { icon: string; title: string; sub: string; trailing?: React.ReactNode; onClick?: () => void }) {
  return (
    <button onClick={onClick} className="w-full text-left bg-surface-container-lowest rounded-card p-4 border border-neutral-300 card-shadow flex items-center gap-4 active:scale-[0.99] transition-transform">
      <div className="w-12 h-12 rounded-full bg-secondary-container flex items-center justify-center text-secondary shrink-0">
        <Icon name={icon} style={{ fontSize: 24 }} />
      </div>
      <div className="flex flex-col flex-1 min-w-0">
        <span className="font-heading text-[17px] font-bold text-ink">{title}</span>
        <span className="font-body text-[15px] text-on-surface-variant leading-snug">{sub}</span>
      </div>
      {trailing ?? <Icon name="chevron_right" className="text-neutral-300" style={{ fontSize: 24 }} />}
    </button>
  );
}
