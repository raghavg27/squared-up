import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../ui.js';
import { UPI_APPS, getUpiApp, setUpiApp } from '../upiApp.js';

export function UpiAppSettings() {
  const nav = useNavigate();
  const [sel, setSel] = useState(getUpiApp().key);

  function choose(key: string) {
    setSel(key);
    setUpiApp(key);
  }

  return (
    <div className="min-h-screen pb-10 bg-paper">
      <header className="flex items-center justify-between px-mobile py-3 border-b border-neutral-100">
        <button onClick={() => nav(-1)} className="w-10 h-10 flex items-center justify-center text-ink active:scale-95 transition-transform">
          <Icon name="arrow_back" />
        </button>
        <h1 className="font-heading text-[22px] font-bold text-ink">Primary UPI App</h1>
        <div className="w-10" />
      </header>

      <main className="px-mobile flex flex-col gap-4 mt-4">
        <p className="font-body text-[15px] text-on-surface-variant">
          We'll surface this app first when you square up. Any installed UPI app can still complete the payment.
        </p>
        <div className="bg-surface-container-lowest rounded-card border border-neutral-300 card-shadow divide-y divide-neutral-100">
          {UPI_APPS.map((a) => {
            const active = a.key === sel;
            return (
              <button key={a.key} onClick={() => choose(a.key)} className="w-full text-left p-4 flex items-center gap-3 active:bg-surface-container-low transition-colors">
                <div className="w-10 h-10 rounded-button bg-secondary-container text-secondary flex items-center justify-center shrink-0">
                  <Icon name="account_balance_wallet" style={{ fontSize: 22 }} />
                </div>
                <span className="flex-1 font-body text-[17px] text-ink">{a.label}</span>
                {active && <Icon name="check_circle" fill className="text-primary" style={{ fontSize: 24 }} />}
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
