// Shared loading placeholders shaped like the real Monzo rows/heroes they
// stand in for, so content lands without layout shift. All build on the
// shimmering `.skeleton` class in index.css (reduced-motion safe).

/** Stand-in for the borderless list row: 49px icon tile + two lines + amount. */
export function RowSkeletons({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3">
          <span className="skeleton w-[49px] h-[49px] shrink-0 rounded-xl" />
          <div className="flex flex-col flex-1 gap-1.5">
            <span className="skeleton h-3.5 w-2/3 rounded-full" />
            <span className="skeleton h-3 w-2/5 rounded-full" />
          </div>
          <span className="skeleton h-4 w-14 rounded-full" />
        </div>
      ))}
    </div>
  );
}

/** Stand-in for a screen's hero number + caption (GroupDetail, FriendDetail). */
export function HeroSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2.5 pt-9" aria-hidden>
      <span className="skeleton h-10 w-40 rounded-card" />
      <span className="skeleton h-3.5 w-28 rounded-full" />
    </div>
  );
}

/** Stand-in for Home's balance donut + legend. */
export function DonutSkeleton() {
  return (
    <div className="flex flex-col items-center gap-4 pt-9" aria-hidden>
      <span className="skeleton w-44 h-44 rounded-full" />
      <div className="flex gap-5">
        <span className="skeleton h-3.5 w-28 rounded-full" />
        <span className="skeleton h-3.5 w-24 rounded-full" />
      </div>
    </div>
  );
}

/** Stand-in for the 2-column stat tile grid. */
export function TileSkeletons({ count = 2 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="skeleton h-[92px] rounded-card" />
      ))}
    </div>
  );
}
