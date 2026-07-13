import { Link, useNavigate } from 'react-router-dom';
import { Avatar, Icon } from './ui.js';
import { useStore } from './store.js';

// The Monzo-concept coral header band. Every screen opens with one of these
// two banners; the white content sheet (`monzo-sheet`) pulls up over its
// bottom edge with a negative margin.

// Tab roots: title + optional sub on the left; page `action`, then the
// universal notifications + account controls on the right — same fixed order
// on every tab.
export function CoralBanner({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  const { me } = useStore();
  return (
    <header className="relative mx-6 mt-3 h-[128px] rounded-[30px] bg-primary shadow-banner flex items-start justify-between px-6 pt-6">
      <div className="flex flex-col gap-0.5 min-w-0">
        <h1 className="font-heading text-[22px] font-extrabold text-white leading-tight truncate">{title}</h1>
        {sub && <span className="font-body text-[13px] font-semibold text-white/85 truncate">{sub}</span>}
      </div>
      <div className="flex items-center gap-1 shrink-0 -mr-1">
        {action}
        <Link to="/activity" aria-label="Activity" className="w-9 h-9 flex items-center justify-center rounded-full text-white active:scale-95 transition-transform">
          <Icon name="notifications" style={{ fontSize: 22 }} />
        </Link>
        <Link to="/profile" aria-label="Profile" className="active:scale-95 transition-transform rounded-full ring-2 ring-white/80">
          <Avatar name={me?.name ?? ''} size={34} me />
        </Link>
      </div>
    </header>
  );
}

// Sub-screens: back chevron + title left, optional page action right.
// `onBack` defaults to history back.
export function PageBanner({ title, sub, action, onBack }: {
  title: string; sub?: string; action?: React.ReactNode; onBack?: () => void;
}) {
  const nav = useNavigate();
  return (
    <header className="relative mx-6 mt-3 h-[128px] rounded-[30px] bg-primary shadow-banner flex items-start justify-between px-4 pt-5">
      <div className="flex items-center gap-1 min-w-0">
        <button onClick={onBack ?? (() => nav(-1))} aria-label="Back" className="w-10 h-10 shrink-0 flex items-center justify-center text-white active:scale-95 transition-transform">
          <Icon name="arrow_back" style={{ fontSize: 24 }} />
        </button>
        <div className="flex flex-col gap-0.5 min-w-0">
          <h1 className="font-heading text-[21px] font-extrabold text-white leading-tight truncate">{title}</h1>
          {sub && <span className="font-body text-[13px] font-semibold text-white/85 truncate">{sub}</span>}
        </div>
      </div>
      {action && <div className="flex items-center shrink-0 text-white">{action}</div>}
    </header>
  );
}
