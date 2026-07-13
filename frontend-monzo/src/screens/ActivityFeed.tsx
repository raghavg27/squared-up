import { useMemo, useState } from 'react';
import { apiClient, type ActivityEvent } from '../api.js';
import { useStore } from '../store.js';
import { useCached } from '../cache.js';
import { friendlyError } from '../errors.js';
import { Icon } from '../ui.js';
import { CoralBanner } from '../banners.js';
import { ActivityRow, activityBucket, renderActivity, type ActivityRowData } from '../activityRows.js';
import { RowSkeletons } from '../skeletons.js';
import { LoadErrorCard } from '../ErrorBoundary.js';

export function ActivityFeed() {
  const { me, name, groups } = useStore();
  const [q, setQ] = useState('');

  // Same cache key as Home's Recent activity — the full feed opens instantly.
  const ev = useCached('activity', () => apiClient.activity());
  const events = ev.data ?? [];

  const groupName = (gid: unknown) => (typeof gid === 'number' ? groups.find((g) => g.id === gid)?.name : undefined);

  const grouped = useMemo(() => {
    const rows = events
      .map((e) => ({ e, r: renderActivity(e, name, me?.id, groupName) }))
      .filter(({ r }) => r.title.toLowerCase().includes(q.toLowerCase()) || r.sub.toLowerCase().includes(q.toLowerCase()));
    const map = new Map<string, { e: ActivityEvent; r: ActivityRowData }[]>();
    for (const item of rows) {
      const b = activityBucket(item.e.created_at);
      (map.get(b) ?? map.set(b, []).get(b)!).push(item);
    }
    return [...map.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, q, me]);

  return (
    <div className="min-h-screen pb-28 bg-paper">
      <CoralBanner title="Activity" sub="Everything that moved money" />

      <main className="monzo-sheet mx-3 -mt-9 px-6 pb-8">
        <span className="sheet-handle" />

        {/* Monzo search row: borderless, magnifier on the right */}
        <div className="flex items-center gap-3 mt-8">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="flex-1 bg-transparent outline-none font-body text-[15px] text-ink placeholder:text-outline"
            placeholder="Search..."
          />
          <Icon name="search" className="text-outline" style={{ fontSize: 24 }} />
        </div>
        <div className="h-px bg-neutral-100 mt-3" />

        {ev.loading && <div className="mt-6"><RowSkeletons count={6} /></div>}

        {ev.error !== undefined && (
          <div className="mt-6">
            <LoadErrorCard
              message={friendlyError(ev.error, "Couldn't load your activity — give it another try.")}
              onRetry={ev.refresh}
            />
          </div>
        )}

        {grouped.map(([label, items]) => (
          <div key={label} className="flex flex-col gap-4 mt-6">
            <h3 className="font-body text-[16px] font-semibold text-neutral-600">{label}</h3>
            {items.map(({ r }) => <ActivityRow key={r.id} r={r} />)}
          </div>
        ))}
        {!ev.loading && ev.error === undefined && events.length === 0 && (
          <p className="text-neutral-600 font-body text-[15px] text-center py-10">No activity yet.</p>
        )}
      </main>
    </div>
  );
}
