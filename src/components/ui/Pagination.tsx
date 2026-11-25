import React, { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { useT } from '../../i18n';

// Long lists show one page at a time: "11–20 of 65" with Previous / Next and
// page numbers. Going back to page 1 whenever the list itself changes
// (a search, a filter), so nobody is left on an empty page.
export function usePaged<T extends { id?: string }>(items: T[], pageSize = 12) {
  const [page, setPage] = useState(1);
  const key = `${items.length}:${items[0]?.id ?? ''}`;
  const [seenKey, setSeenKey] = useState(key);
  if (seenKey !== key) {
    setSeenKey(key);
    if (page !== 1) setPage(1);
  }
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(page, pages);
  const start = (current - 1) * pageSize;
  return {
    rows: items.slice(start, start + pageSize),
    pager: <Pagination page={current} pages={pages} total={items.length} from={start + 1} to={Math.min(items.length, start + pageSize)} onPage={setPage} />,
  };
}

// 1 … 4 5 6 … 12 around the current page.
function pageList(page: number, pages: number): (number | '…')[] {
  const want = new Set([1, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const list: (number | '…')[] = [];
  Array.from(want)
    .sort((a, b) => a - b)
    .forEach((p, i, arr) => {
      if (i > 0 && p - arr[i - 1] > 1) list.push('…');
      list.push(p);
    });
  return list;
}

export const Pagination: React.FC<{
  page: number;
  pages: number;
  total: number;
  from: number;
  to: number;
  onPage: (page: number) => void;
  className?: string;
}> = ({ page, pages, total, from, to, onPage, className }) => {
  const t = useT();
  if (pages <= 1) return null;
  const box = 'h-10 min-w-[2.5rem] px-3 flex items-center justify-center text-[0.9375rem] font-semibold transition-colors';
  return (
    <nav aria-label={t('Pages')} className={clsx('flex flex-wrap items-center justify-between gap-3 px-4 py-3 no-print', className)}>
      <span className="text-sm text-os-muted">{t('{a}–{b} of {n}', { a: from, b: to, n: total })}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className={clsx(box, 'gap-1 ring-1 ring-inset ring-os-line hover:ring-os-accent disabled:opacity-30 disabled:hover:ring-os-line')}
        >
          <ChevronLeft size={16} />
          <span className="hidden sm:inline">{t('Previous')}</span>
        </button>
        {pageList(page, pages).map((p, i) =>
          p === '…' ? (
            <span key={`gap-${i}`} className="px-1 text-os-muted">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p)}
              aria-current={p === page ? 'page' : undefined}
              className={clsx(box, p === page ? 'bg-os-accent text-white' : 'hover:bg-os-soft')}
            >
              {p}
            </button>
          )
        )}
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          className={clsx(box, 'gap-1 ring-1 ring-inset ring-os-line hover:ring-os-accent disabled:opacity-30 disabled:hover:ring-os-line')}
        >
          <span className="hidden sm:inline">{t('Next')}</span>
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
};

// For lists inside screens that return early: the rows and the page buttons,
// without calling the hook in the screen itself.
export function Paged<T extends { id?: string }>({
  items,
  size = 12,
  children,
}: {
  items: T[];
  size?: number;
  children: (rows: T[], pager: React.ReactNode) => React.ReactNode;
}) {
  const { rows, pager } = usePaged(items, size);
  return <>{children(rows, pager)}</>;
}
