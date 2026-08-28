import { NextResponse } from 'next/server';
import { DEFAULT_MACHINE_ID, getTierBoard, listGames, listLevels } from '@/lib/tier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/tier?machineId=1&mode=S&level=15&playerId=1
 *
 * mode/level 은 "희망값"으로 받고, 그 게임에 없는 조합이면 가장 가까운 조합으로
 * 대신 그려 줍니다. 게임을 바꾸면 이전 게임의 모드·레벨이 그대로 넘어오는데
 * (펌프 S15 → 사볼 S15) 그때마다 빈 화면을 보여주는 것보다 낫습니다.
 * 실제로 그려진 조합은 board.mode / board.level 에 실려 나갑니다.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const games = await listGames();
  const rawMachine = Number(searchParams.get('machineId'));
  // 서열표가 없는 기종(인형뽑기 등)이 URL 로 들어와도 화면이 비지 않게 기본 게임으로.
  const machineId = games.some((g) => g.machineId === rawMachine)
    ? rawMachine
    : (games[0]?.machineId ?? DEFAULT_MACHINE_ID);

  const levels = await listLevels(machineId);
  const mode = searchParams.get('mode');
  const level = Number(searchParams.get('level'));

  /**
   * 난이도 축인 게임(사볼)은 levels 의 mode 가 전부 null 이라 mode 로 좁힐 수
   * 없습니다. 그래서 레벨만 맞춰 찾고, 못 찾으면 첫 항목으로 갑니다.
   * 모드가 있는 게임(펌프)은 지금까지처럼 (모드, 레벨) → 모드 → 첫 항목 순입니다.
   */
  const byLevel = levels.filter((l) => l.mode === null);
  const wanted =
    (byLevel.length
      ? byLevel.find((l) => l.level === level)
      : (levels.find((l) => l.mode === mode && l.level === level) ??
        levels.find((l) => l.mode === mode))) ?? levels[0];

  if (!wanted) return NextResponse.json({ games, machineId, levels, board: null });

  const rawPlayer = Number(searchParams.get('playerId'));
  const playerId = Number.isInteger(rawPlayer) && rawPlayer > 0 ? rawPlayer : null;

  const board = await getTierBoard({
    machineId,
    mode: wanted.mode,
    level: wanted.level,
    playerId,
  });
  return NextResponse.json({ games, machineId, levels, board });
}
