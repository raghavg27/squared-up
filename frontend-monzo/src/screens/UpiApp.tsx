import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../ui.js';
import { PageBanner } from '../banners.js';
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
      <PageBanner title="Primary UPI App" sub="Used first when you square up" />

      <main className="monzo-sheet mx-3 -mt-9 px-6 pb-8 flex flex-col gap-5">
        <span className="sheet-handle" />
        <p className="font-body text-[13px] font-semibold text-neutral-600 pt-3">
          We'll surface this app first when you square up. Any installed UPI app can still complete the payment.
        </p>
        <div className="flex flex-col gap-4">
          {UPI_APPS.map((a) => {
            const active = a.key === sel;
            return (
              <button key={a.key} onClick={() => choose(a.key)} className="w-full text-left flex items-center gap-3 active:scale-[0.98] transition-transform">
                <span className={`w-[49px] h-[49px] rounded-xl flex items-center justify-center shrink-0 transition-colors ${active ? 'bg-primary text-white shadow-tile-coral' : 'bg-surface shadow-soft text-secondary'}`}>
                  <Icon name="account_balance_wallet" style={{ fontSize: 24 }} />
                </span>
                <span className="flex-1 font-body text-[16px] font-bold text-ink">{a.label}</span>
                {active && <Icon name="check_circle" fill className="text-primary" style={{ fontSize: 24 }} />}
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
