import type { CSSProperties } from 'react';

/** Shimmering placeholder block — sizes are controlled entirely via className. */
export function Skeleton({ className = '', style }: { className?: string; style?: CSSProperties }) {
  return <div className={`skeleton animate-shimmer rounded-md ${className}`} style={style} />;
}

/** Row of table cells shaped like real data, for use inside a <tbody>. */
export function SkeletonTableRows({
  rows = 6,
  columns,
  withCheckbox = false,
}: {
  rows?: number;
  /** Relative width per column, e.g. ['w-40', 'w-24', 'w-16'] */
  columns: string[];
  withCheckbox?: boolean;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-gray-50 dark:border-gray-800/60 last:border-0">
          {withCheckbox && (
            <td className="px-5 py-4">
              <Skeleton className="w-4 h-4 rounded" />
            </td>
          )}
          {columns.map((w, c) => (
            <td key={c} className="px-5 py-4">
              <Skeleton className={`h-4 ${w}`} style={{ animationDelay: `${(r * columns.length + c) * 40}ms` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

/** Compact card-shaped skeleton (stat cards, quota banners, etc). */
export function SkeletonCard({ className = '' }: { className?: string }) {
  return (
    <div className={`bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm ${className}`}>
      <Skeleton className="h-3 w-20 mb-3" />
      <Skeleton className="h-5 w-32" />
    </div>
  );
}
