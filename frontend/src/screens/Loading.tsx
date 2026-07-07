export function Logo({ size = 88 }: { size?: number }) {
  return (
    <div
      className="bg-surface-container-lowest rounded-[20px] card-shadow border border-neutral-100 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <img src="/logo.png" alt="Squared Up" width={size * 0.62} height={size * 0.62} style={{ objectFit: 'contain' }} />
    </div>
  );
}

export function Loading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-mobile bg-paper">
      <Logo />
      <h1 className="font-heading text-[28px] leading-9 font-bold text-ink mt-6">Squared Up</h1>
      <p className="font-body text-[15px] text-on-surface-variant mt-2">Getting your groups ready…</p>
      <div className="w-[180px] h-[6px] rounded-full bg-primary/15 overflow-hidden mt-8">
        <div className="h-full w-2/5 bg-primary rounded-full animate-[su-slide_1.1s_ease-in-out_infinite]" />
      </div>
      <style>{`@keyframes su-slide{0%{transform:translateX(-120%)}100%{transform:translateX(360%)}}`}</style>
    </div>
  );
}
