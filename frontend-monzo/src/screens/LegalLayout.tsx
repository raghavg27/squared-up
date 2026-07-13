import { PageBanner } from '../banners.js';

// Shared chrome for the public legal pages (Privacy, Terms). Reachable while
// logged out, so the back arrow just pops history (→ Login) rather than a tab.
export function LegalLayout({ title, updated, children }: {
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen pb-14 bg-paper">
      <PageBanner title={title} sub={`Last updated: ${updated}`} />

      <main className="monzo-sheet mx-3 -mt-9 px-6 pb-8">
        <span className="sheet-handle" />
        <div className="pt-2">{children}</div>
      </main>
    </div>
  );
}

// One titled block: heading + body paragraphs passed as children.
export function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="font-heading text-[18px] font-extrabold text-ink">{heading}</h2>
      <div className="font-body text-[15px] text-on-surface-variant leading-relaxed mt-2 flex flex-col gap-3">
        {children}
      </div>
    </section>
  );
}
