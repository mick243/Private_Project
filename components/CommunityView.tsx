'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  POPULAR_MIN_LIKES,
  POSTS_PAGE_SIZE,
  type Board,
  type BoardCategory,
  type PostDetail,
  type PostSort,
  type PostSummary,
} from '@/lib/board-types';
import { usePlayerId } from '@/lib/use-player';
import Pagination from './Pagination';
import PostDetailView from './PostDetailView';
import PostForm from './PostForm';
import PostList from './PostList';

/**
 * 커뮤니티 — 리듬게임별 탭.
 *
 * 탭은 리듬 기종 목록이고, '전체' 는 machineId 를 빼고 조회한 것입니다.
 * 저장 구조가 게임마다 갈리지 않으므로 게임이 늘어도 이 화면은 그대로입니다.
 */

/**
 * 검색어를 서버로 보내기까지 기다리는 시간. 한 글자마다 조회를 내보내면
 * '발판' 을 치는 동안 요청이 두 번 나가고, 늦게 온 첫 글자의 응답이 나중
 * 결과를 덮어쓸 수 있습니다. /live 피드와 같은 값입니다.
 */
const SEARCH_DEBOUNCE_MS = 300;

/** 열려 있는 화면. 목록 / 상세 / 작성·수정 */
type View =
  | { kind: 'list' }
  | { kind: 'detail'; postId: number }
  | { kind: 'form'; post: PostDetail | null };

export default function CommunityView() {
  const playerId = usePlayerId();

  const [boards, setBoards] = useState<Board[]>([]);
  const [categories, setCategories] = useState<BoardCategory[]>([]);

  /** null = '전체' 탭 */
  const [machineId, setMachineId] = useState<number | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState<PostSort>('recent');
  /** 검색창에 지금 적혀 있는 값 / 실제로 조회에 쓰인 값 */
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  /** 1-based */
  const [page, setPage] = useState(1);

  const [posts, setPosts] = useState<PostSummary[]>([]);
  /** 목록 맨 위에 고정되는 공지. 게임 탭·말머리·정렬과 무관하게 서버가 골라 준다 */
  const [notices, setNotices] = useState<PostSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<View>({ kind: 'list' });

  /**
   * 상세/글쓰기로 들어갈 때마다 히스토리를 한 칸 쌓는다 (URL 은 그대로, 상태만).
   * 그래서 브라우저 뒤로/앞으로가 오락실 파인더로 나가는 대신 이 화면 안의
   * 해당 단계로 오간다 — 탭·말머리·정렬은 그대로 list 로 setView 하는 것뿐이라
   * 건드리지 않은 채 남아 있다.
   *
   * history.state 에는 view 전체(글 내용 포함)를 넣지 않고 배열 인덱스만
   * 넣는다 — 실제 화면은 이 컴포넌트가 살아있는 동안 유지되는 viewsRef 에서
   * 인덱스로 찾는다. popstate 는 뒤/앞 어느 쪽이든 그 인덱스만 알려주므로
   * 방향을 따로 구분할 필요가 없다.
   *
   * ⚠ 처음 이 페이지로 들어올 때 만들어진 히스토리 엔트리(= idx 0)의
   * state 는 절대 replaceState 로 덮어쓰지 않는다. 그건 Next.js 라우터가
   * 자기 복원용으로 넣어둔 값이라, 덮으면 popstate 때 라우터가 그 페이지를
   * 통째로 다시 마운트해버려서(= machineId 같은 탭 선택이 초기화됨) 이 기능이
   * 고치려던 문제가 다른 모습으로 재발한다. idx 가 없는(undefined) 엔트리는
   * 그냥 0 으로 취급하면 된다 — 아래 popstate 핸들러가 이미 그렇게 한다.
   */
  const viewsRef = useRef<View[]>([{ kind: 'list' }]);
  const idxRef = useRef(0);

  const navigate = (next: View) => {
    const nextIdx = idxRef.current + 1;
    // 뒤로 갔다가 다른 곳으로 가면 그 앞에 있던 '앞으로' 기록은 브라우저의
    // 기본 동작과 같이 버린다.
    viewsRef.current = viewsRef.current.slice(0, nextIdx);
    viewsRef.current[nextIdx] = next;
    idxRef.current = nextIdx;
    window.history.pushState({ __idx: nextIdx }, '');
    setView(next);
  };

  /** 히스토리를 새로 쌓지 않고 현재 칸의 화면만 바꾼다 (글쓰기 → 상세로
   *  넘어가는 저장 직후처럼, 뒤로/앞으로 갔을 때 이 결과가 보여야 하는 경우). */
  const replaceCurrent = (next: View) => {
    viewsRef.current[idxRef.current] = next;
    setView(next);
  };

  /** 인앱 '뒤로가기'/'취소' 버튼도 브라우저 뒤로가기와 같은 한 걸음이어야
   *  history 깊이가 눈에 보이는 이동 횟수와 어긋나지 않는다. */
  const goBack = () => {
    if (idxRef.current > 0) {
      window.history.back();
    } else {
      setView({ kind: 'list' });
    }
  };

  useEffect(() => {
    fetch('/api/boards')
      .then((r) => r.json())
      .then((d) => {
        setBoards(d.boards as Board[]);
        setCategories(d.categories as BoardCategory[]);
      })
      .catch(() => undefined);
  }, []);

  /**
   * 검색어를 늦춰 반영하면서 **같은 틱에** 1페이지로 돌린다.
   *
   * 둘을 나누면(setPage 를 term 을 보는 별도 effect 로 빼면) 새 검색어와 옛
   * 페이지가 한 번 겹친 채로 조회가 나간다 — 3페이지에서 검색하면
   * `offset=40&q=…` 이 먼저 나가고, 그게 빈 응답으로 돌아오면 아래 loadPosts 의
   * '비면 한 페이지 물러난다' 가 이미 1페이지가 된 state 를 한 번 더 깎아
   * offset 을 음수로 만든다. 실제로 그랬다 (offset=-20 요청이 나갔다).
   *
   * 같은 타이머 안에서 둘을 부르면 React 가 한 번의 렌더로 묶으므로, 새 검색어는
   * 1페이지와만 짝지어 나간다. 페이지가 이미 1이면 setPage 는 아무 일도 안 한다.
   *
   * 탭·말머리는 이 문제가 없다 — 누르는 그 자리에서 resetPaging 을 같이 부르므로
   * 옛 페이지와 새 조건이 겹치는 순간이 없다.
   *
   * 첫 실행은 건너뛴다. 이 타이머는 화면이 열릴 때도 한 번 도는데(q 가 빈 값인
   * 채로), 그때까지 페이지를 되돌리면 목록이 뜨자마자 2페이지를 누른 사람이
   * 300ms 뒤에 이유 없이 1페이지로 끌려온다. 검색어가 바뀐 게 아니라 화면이
   * 열린 것이므로 되돌릴 이유가 없다.
   */
  const searchStarted = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      if (searchStarted.current) setPage(1);
      searchStarted.current = true;
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  /**
   * 검색 버튼 · 엔터 — 디바운스를 기다리지 않고 지금 조회한다. 위 타이머와
   * 같은 이유로 검색어와 페이지를 **한 번에** 되돌린다.
   *
   * 여기서는 searchStarted 를 보지 않는다. 위 타이머가 그걸 보는 것은 "화면이
   * 열려서 한 번 돈 것" 과 "검색어가 바뀐 것" 을 가리기 위한 것인데, 버튼을
   * 손으로 누른 것은 언제 눌렀든 검색이다 — 2페이지에서 눌렀다면 그 검색
   * 결과의 1페이지를 봐야 한다.
   *
   * 뜨고 있는 타이머는 굳이 끄지 않는다. 300ms 뒤에 같은 값으로 한 번 더
   * 불리지만 값이 같으면 React 가 리렌더를 건너뛴다.
   */
  const submitSearch = () => {
    setDebouncedQ(q);
    setPage(1);
    searchStarted.current = true;
  };

  /**
   * 지우기 — 화면의 값과 조회에 쓰인 값을 함께 비우고 1페이지로 돌린다.
   * setQ 만 하면 목록이 300ms 뒤에야 돌아와 "안 먹었다" 로 읽힌다.
   */
  const clearSearch = () => {
    setQ('');
    setDebouncedQ('');
    setPage(1);
    searchStarted.current = true;
  };

  /**
   * 조회에 실을 검색어. 공백만 적은 것은 검색이 아니다.
   *
   * loadPosts 의 의존성으로도 이 값을 쓴다 — debouncedQ 를 그대로 쓰면 뒤에
   * 공백 하나를 붙이는 것만으로 같은 결과를 다시 받아 온다.
   */
  const term = debouncedQ.trim();

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        sort,
        limit: String(POSTS_PAGE_SIZE),
        offset: String((page - 1) * POSTS_PAGE_SIZE),
      });
      if (machineId !== null) params.set('machineId', String(machineId));
      if (category !== null) params.set('category', category);
      if (playerId) params.set('playerId', String(playerId));
      if (term) params.set('q', term);

      const data = await fetch(`/api/posts?${params}`).then((r) => r.json());
      const list = data.posts as PostSummary[];
      const count = data.total as number;
      // 공지는 total 에 들어 있지 않다 — 페이지 수는 일반 글만으로 센다.
      setNotices((data.notices ?? []) as PostSummary[]);

      // 글이 지워져 현재 페이지가 비었으면 한 페이지 앞으로 물러난다.
      // (마지막 페이지의 마지막 글을 지운 경우)
      //
      // 조건은 이 조회가 나갈 때의 page(클로저)를 보는데 깎는 것은 **지금의**
      // page 다. 늦게 온 응답이면 그 둘이 다를 수 있으므로 updater 안에서 한 번
      // 더 막는다 — 1페이지를 깎으면 offset 이 음수가 된다.
      if (list.length === 0 && count > 0 && page > 1) {
        setPage((p) => (p > 1 ? p - 1 : p));
        return;
      }
      setPosts(list);
      setTotal(count);
    } finally {
      setLoading(false);
    }
  }, [machineId, category, sort, page, playerId, term]);

  useEffect(() => {
    void loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const idx =
        e.state && typeof e.state.__idx === 'number' ? (e.state.__idx as number) : 0;
      idxRef.current = idx;
      const next = viewsRef.current[idx] ?? { kind: 'list' };
      setView(next);
      if (next.kind === 'list') void loadPosts(); // 추천·댓글 수가 바뀌었을 수 있다
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [loadPosts]);

  /** 탭·말머리·정렬을 바꾸면 1페이지부터 다시 본다 */
  const resetPaging = () => setPage(1);

  /** 목록이 시작되는 지점 (고정 공지 포함). 페이지를 넘길 때 여기로 올린다 */
  const listTopRef = useRef<HTMLDivElement>(null);

  /**
   * 페이지 이동 — 목록 첫 글이 화면 맨 위로 오게 스크롤합니다.
   *
   * 페이지 버튼은 목록 맨 아래에 있어서, 그냥 두면 다음 페이지도 **바닥부터**
   * 보입니다 — 사용자는 매번 손으로 맨 위까지 올려야 새 페이지를 읽을 수 있습니다.
   *
   * 새 글이 로드되기를 기다리지 않고 바로 올립니다. 목록의 위치 자체는 데이터와
   * 무관하게 그대로이므로 즉시 올려도 어긋나지 않고, 로드가 끝나면 그 자리의
   * 내용만 바뀝니다. 탭·말머리 변경(resetPaging)에는 걸지 않습니다 — 그건 이미
   * 필터 줄(목록 위)을 누른 뒤라 화면이 목록 근처에 있습니다.
   */
  const changePage = (next: number) => {
    setPage(next);
    listTopRef.current?.scrollIntoView({ block: 'start' });
  };

  const openPost = (postId: number) => navigate({ kind: 'detail', postId });

  /** 글이 새로 쓰이거나 지워지면 탭 글 수도 다시 읽는다 */
  const refreshBoards = () => {
    fetch('/api/boards')
      .then((r) => r.json())
      .then((d) => setBoards(d.boards as Board[]))
      .catch(() => undefined);
  };

  if (view.kind === 'detail') {
    return (
      <div className="board-page">
        <PostDetailView
          postId={view.postId}
          onBack={goBack}
          onEdit={(post) => navigate({ kind: 'form', post })}
          onDeleted={() => {
            refreshBoards();
            goBack();
          }}
        />
      </div>
    );
  }

  if (view.kind === 'form') {
    return (
      <div className="board-page">
        <PostForm
          boards={boards}
          categories={categories}
          initial={view.post}
          defaultMachineId={machineId ?? boards[0]?.machineId ?? null}
          onCancel={goBack}
          onSaved={(post) => {
            refreshBoards();
            // 새 히스토리를 쌓지 않고 폼이 있던 칸을 상세로 바꾼다 — 그래야
            // 나중에 앞으로가기를 눌러도 사라진 글쓰기 폼이 아니라 이 상세가 나온다.
            replaceCurrent({ kind: 'detail', postId: post.id });
          }}
        />
      </div>
    );
  }


  return (
    <div className="board-page">
      <header className="board-head">
        <div>
          <h1>커뮤니티</h1>
          <p className="muted small">
            리듬게임별 게시판입니다. 오락실 정보 · 공략 · 질문을 게임 단위로 모읍니다.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!playerId}
          title={playerId ? undefined : '로그인이 필요합니다'}
          onClick={() => navigate({ kind: 'form', post: null })}
        >
          글쓰기
        </button>
      </header>

      {/* ── 게임 탭 ── */}
      <nav className="game-tabs">
        <button
          type="button"
          className={machineId === null ? 'game-tab is-on' : 'game-tab'}
          onClick={() => {
            setMachineId(null);
            resetPaging();
          }}
        >
          전체
        </button>
        {boards.map((b) => (
          <button
            key={b.machineId}
            type="button"
            className={machineId === b.machineId ? 'game-tab is-on' : 'game-tab'}
            title={b.name}
            onClick={() => {
              setMachineId(b.machineId);
              resetPaging();
            }}
          >
            {b.shortName}
          </button>
        ))}
      </nav>

      {/* ── 검색 ──
          게임 탭 **아래**에 둔다 — 탭이 검색 범위이므로(사볼 탭에서 찾으면 사볼
          글만 나온다) 범위가 먼저 보이고 검색어가 그 다음이어야 읽는 순서가
          맞다. 말머리·정렬 줄과 한 줄에 합치지 않는 이유: 말머리 칩이 기종
          수만큼 늘어나는 줄이라, 거기에 입력창을 끼우면 좁은 화면에서 검색창이
          칩 사이 어딘가로 밀려간다. */}
      {/* <form> 인 이유는 엔터다 (components/LiveFeed.tsx 의 같은 줄 주석 참고) */}
      <form className="list-search" onSubmit={(e) => { e.preventDefault(); submitSearch(); }}>
        <input
          className="search"
          type="search"
          aria-label="글 검색"
          placeholder="제목 · 본문 검색"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="submit" className="btn btn-sm btn-primary">
          검색
        </button>
        {/* 값이 없을 때 감추지 않고 끄는 이유는 아래 건수 칸과 같다 — 나타나고
            사라지면 그 칸이 밀려서 글자를 치는 중에 줄이 흔들린다. */}
        <button type="button" className="btn btn-sm" disabled={q === ''} onClick={clearSearch}>
          지우기
        </button>
        {/* 몇 건인지는 검색 중에만 뜻이 있다 — 평소의 전체 글 수는 페이지
            버튼이 이미 말해 준다. loading 중에 옛 total 을 그대로 보여주면
            직전 검색어의 건수가 새 검색어 옆에 붙으므로 문구로 바꿔 둔다. */}
        {term !== '' && (
          <span className="list-search-count muted small">
            {loading ? '찾는 중…' : `${total.toLocaleString('ko-KR')}건`}
          </span>
        )}
      </form>

      {/* ── 말머리 · 정렬 ── */}
      <div className="board-filters">
        <div className="chips">
          <button
            type="button"
            className={category === null ? 'chip is-on' : 'chip'}
            onClick={() => {
              setCategory(null);
              resetPaging();
            }}
          >
            전체
          </button>
          {categories.map((c) => (
            <button
              key={c.code}
              type="button"
              className={category === c.code ? 'chip is-on' : 'chip'}
              onClick={() => {
                setCategory(c.code);
                resetPaging();
              }}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* 인기글은 말머리와 다른 축(정렬)이라 같은 줄 오른쪽 끝에 따로 세운다.
            누르면 인기순, 다시 누르면 기본값인 최신순 — 정렬 버튼이 이것뿐이므로
            최신순으로 돌아갈 길도 이 버튼이 겸한다.
            기준(추천 N개)은 눌러 보기 전에는 알 수 없으므로 title 로 미리 알린다. */}
        <button
          type="button"
          className={sort === 'popular' ? 'board-sort is-on' : 'board-sort'}
          aria-pressed={sort === 'popular'}
          title={`추천 ${POPULAR_MIN_LIKES}개 이상 받은 글만`}
          onClick={() => {
            setSort(sort === 'popular' ? 'recent' : 'popular');
            resetPaging();
          }}
        >
          인기글
        </button>
      </div>

      <div ref={listTopRef} />
      <PostList
        posts={posts}
        notices={notices}
        loading={loading}
        total={total}
        /* '전체' 탭에서만 어느 게임 글인지 보여준다 — 게임 탭에서는 전부 같은 값이라 잡음이다 */
        showGame={machineId === null}
        popularOnly={sort === 'popular'}
        /* 목록이 비었을 때 "첫 글을 남겨 보세요" 가 아니라 "검색 결과가 없습니다"
           라고 해야 한다 — 글은 있고, 찾는 말이 없을 뿐이다 */
        searching={term !== ''}
        onOpen={openPost}
      />

      <Pagination
        page={page}
        total={total}
        pageSize={POSTS_PAGE_SIZE}
        onChange={changePage}
      />
    </div>
  );
}
