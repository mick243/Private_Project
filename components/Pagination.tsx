'use client';

import { pageNumbers, totalPagesOf } from '@/lib/board-types';

interface Props {
  /** 1-based */
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
  /** 페이지가 1개뿐일 때도 그릴지 (기본은 감춤) */
  showSingle?: boolean;
}

/**
 * 페이지 번호 이동. 글 목록과 댓글이 같은 컴포넌트를 씁니다 —
 * 한쪽만 '더 보기', 다른 쪽은 번호식이면 같은 화면에서 규칙이 두 개가 됩니다.
 */
export default function Pagination({
  page,
  total,
  pageSize,
  onChange,
  showSingle = false,
}: Props) {
  const totalPages = totalPagesOf(total, pageSize);
  if (totalPages <= 1 && !showSingle) return null;

  const pages = pageNumbers(page, totalPages);
  const go = (p: number) => onChange(Math.min(Math.max(1, p), totalPages));

  return (
    <nav className="pagination" aria-label="페이지">
      <button
        type="button"
        className="page-btn"
        disabled={page <= 1}
        onClick={() => go(1)}
        aria-label="첫 페이지"
      >
        «
      </button>
      <button
        type="button"
        className="page-btn"
        disabled={page <= 1}
        onClick={() => go(page - 1)}
        aria-label="이전 페이지"
      >
        ‹
      </button>

      {pages.map((p) => (
        <button
          key={p}
          type="button"
          className={p === page ? 'page-btn is-on' : 'page-btn'}
          aria-current={p === page ? 'page' : undefined}
          onClick={() => go(p)}
        >
          {p}
        </button>
      ))}

      <button
        type="button"
        className="page-btn"
        disabled={page >= totalPages}
        onClick={() => go(page + 1)}
        aria-label="다음 페이지"
      >
        ›
      </button>
      <button
        type="button"
        className="page-btn"
        disabled={page >= totalPages}
        onClick={() => go(totalPages)}
        aria-label="마지막 페이지"
      >
        »
      </button>

      <span className="muted small page-of">
        {page} / {totalPages}
      </span>
    </nav>
  );
}
