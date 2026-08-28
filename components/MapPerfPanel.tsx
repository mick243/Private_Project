'use client';

import { useEffect, useState } from 'react';
import {
  setCullingOff,
  shakeMap,
  useCullingOff,
  useMapMetrics,
  type ShakeResult,
} from '@/lib/map-perf';

/**
 * 지도 성능 계측 패널 — `/?perf=1` 일 때만 뜹니다.
 *
 * 왼쪽 숫자는 **지금** 상태이고, 아래 두 줄은 흔들기 측정의 전/후 기록입니다.
 * 컬링을 껐다 켜며 각각 한 번씩 재면 같은 화면·같은 줌에서의 비교가 됩니다.
 */

interface MemoryInfo {
  usedJSHeapSize: number;
}

export default function MapPerfPanel() {
  const metrics = useMapMetrics();
  const cullingOff = useCullingOff();

  /** DOM·힙은 지도가 알려 줄 수 있는 값이 아니라 여기서 직접 재는 값이라 주기적으로 읽습니다 */
  const [domNodes, setDomNodes] = useState(0);
  const [heapMb, setHeapMb] = useState<number | null>(null);

  const [busy, setBusy] = useState(false);
  const [culledRun, setCulledRun] = useState<ShakeResult | null>(null);
  const [allRun, setAllRun] = useState<ShakeResult | null>(null);

  useEffect(() => {
    const read = () => {
      const canvas = document.querySelector('.map-canvas');
      setDomNodes(canvas ? canvas.querySelectorAll('*').length : 0);
      // performance.memory 는 크롬 계열 전용 비표준입니다 — 없으면 그 줄만 비웁니다.
      const mem = (performance as Performance & { memory?: MemoryInfo }).memory;
      setHeapMb(mem ? +(mem.usedJSHeapSize / 1048576).toFixed(1) : null);
    };
    read();
    const t = setInterval(read, 700);
    return () => clearInterval(t);
  }, []);

  const run = async () => {
    setBusy(true);
    try {
      const result = await shakeMap();
      if (cullingOff) setAllRun(result);
      else setCulledRun(result);
    } finally {
      setBusy(false);
    }
  };

  const both = culledRun && allRun;

  return (
    <div className="perf-panel">
      <div className="perf-title">
        지도 성능 계측
        <span className={cullingOff ? 'perf-mode perf-mode-off' : 'perf-mode'}>
          {cullingOff ? '컬링 OFF (최적화 이전)' : '컬링 ON (지금)'}
        </span>
      </div>

      <dl className="perf-now">
        <div>
          <dt>마커</dt>
          <dd>
            <strong>{metrics.markers.toLocaleString('ko-KR')}</strong>
            <span className="perf-sub"> / {metrics.total.toLocaleString('ko-KR')}곳</span>
          </dd>
        </div>
        <div>
          <dt>지도 DOM</dt>
          <dd>
            <strong>{domNodes.toLocaleString('ko-KR')}</strong>
            <span className="perf-sub"> 노드</span>
          </dd>
        </div>
        <div>
          <dt>JS 힙</dt>
          <dd>
            {heapMb === null ? (
              <span className="perf-sub">크롬에서만</span>
            ) : (
              <>
                <strong>{heapMb}</strong>
                <span className="perf-sub"> MB</span>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt>마지막 동기화</dt>
          <dd>
            <strong>{metrics.syncMs.toFixed(1)}</strong>
            <span className="perf-sub"> ms · draw {metrics.drawCalls}회</span>
          </dd>
        </div>
      </dl>

      <div className="perf-actions">
        <button
          type="button"
          className={cullingOff ? 'btn btn-sm btn-on' : 'btn btn-sm'}
          disabled={busy}
          onClick={() => setCullingOff(!cullingOff)}
        >
          {cullingOff ? '컬링 다시 켜기' : '컬링 끄기'}
        </button>
        <button type="button" className="btn btn-sm btn-primary" disabled={busy} onClick={run}>
          {busy ? '흔드는 중… 4초' : '지도 흔들어 재기'}
        </button>
      </div>

      <table className="perf-table">
        <thead>
          <tr>
            <th />
            <th>FPS</th>
            <th>멈춤</th>
            <th>마커</th>
          </tr>
        </thead>
        <tbody>
          <ShakeRow label="컬링 ON" run={culledRun} />
          <ShakeRow label="컬링 OFF" run={allRun} />
        </tbody>
      </table>

      {both ? (
        <p className="perf-verdict">
          컬링을 켜면 <strong>{(culledRun.fps - allRun.fps).toFixed(1)}fps 더 부드럽고</strong>,
          같은 4초 동안 멈춤이{' '}
          <strong>
            {(allRun.blockedMs - culledRun.blockedMs).toLocaleString('ko-KR')}ms 짧습니다
          </strong>
          .
        </p>
      ) : (
        <p className="perf-hint">
          컬링을 켠 채로 한 번, 끄고 한 번 재면 같은 화면에서의 비교가 됩니다.
          {/* 지도를 넓게 펼치고(축소) 재야 차이가 큽니다 — 화면 안 마커가 많을수록 컬링이 걸러 내는 양도 많습니다 */}
        </p>
      )}
    </div>
  );
}

function ShakeRow({ label, run }: { label: string; run: ShakeResult | null }) {
  if (!run) {
    return (
      <tr className="perf-empty">
        <th>{label}</th>
        <td colSpan={3}>아직 안 잼</td>
      </tr>
    );
  }
  return (
    <tr>
      <th>{label}</th>
      <td>{run.fps}</td>
      <td>{run.blockedMs.toLocaleString('ko-KR')}ms</td>
      <td>{run.markers.toLocaleString('ko-KR')}</td>
    </tr>
  );
}
