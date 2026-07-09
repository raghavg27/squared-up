import { useNavigate } from 'react-router-dom';
import { Icon } from '../ui.js';

// Shared chrome for the public legal pages (Privacy, Terms). Reachable while
// logged out, so the back arrow just pops history (→ Login) rather than a tab.
export function LegalLayout({ title, updated, children }: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  const nav = useNavigate();
  return (
    <div className="min-h-screen pb-14 bg-paper">
      <header className="flex items-center justify-between px-mobile py-3 border-b border-neutral-100 sticky top-0 bg-paper z-10">
        <button onClick={() => nav(-1)} className="w-10 h-10 flex items-center justify-center text-ink active:scale-95 transition-transform">
          <Icon name="arrow_back" />
        </button>
        <h1 className="font-heading text-[22px] font-bold text-ink">{title}</h1>
        <div className="w-10" />
      </header>

      <main className="px-mobile mt-4">
        <p className="font-caption text-caption text-neutral-600">Last updated: {updated}</p>
        {children}
      </main>
    </div>
  );
}

// One titled block: heading + body paragraphs passed as children.
export function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="font-heading text-[18px] font-bold text-ink">{heading}</h2>
      <div className="font-body text-[15px] text-on-surface-variant leading-relaxed mt-2 flex flex-col gap-3">
        {children}
      </div>
    </section>
  );
}
