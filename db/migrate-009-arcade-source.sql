-- ============================================================
-- 오락실 데이터의 출처
--
-- arcades 에 두 칸을 더합니다. 목록이 가상 데이터에서 네이버 지역 검색 결과로
-- 바뀌면서, "이 행이 어디서 왔는가" 가 실제로 판단에 쓰이게 됐습니다:
--
--   source     'seed'   초기 예시 데이터 ((가상) 이름을 달고 있던 것들)
--              'naver'  네이버 지역 검색으로 가져온 실제 업체
--              'manual' 관리자가 화면에서 직접 만든 행
--
--   source_ref source='naver' 일 때의 네이버 업체 링크.
--              같은 오락실을 두 번 넣지 않기 위한 열쇠이자,
--              **영업시간을 사람이 확인해 채울 때 열어 볼 주소**입니다.
--              (지역 검색 응답에는 영업시간 필드가 없습니다 — lib/naver-local.ts)
--
-- source 를 NULL 허용으로 두는 이유: 이 마이그레이션이 돌 때 이미 있는 행의
-- 출처는 우리가 모릅니다. 아래에서 '(가상)' 이 붙은 것만 'seed' 로 표시하고,
-- 나머지는 NULL(=모름)로 남깁니다. DEFAULT 를 'manual' 로 박으면 기존 행 전부가
-- "사람이 직접 넣었다" 는 없는 사실을 갖게 됩니다.
--
-- 재수입(re-import)은 source_ref 로 같은 업체를 찾습니다. UNIQUE 인덱스를
-- 부분 인덱스로 두어 NULL(네이버에서 오지 않은 행)끼리는 충돌하지 않게 합니다.
--
-- ⚠ 여러 번 실행해도 안전해야 합니다 (lib/db.ts runMigrations 주석 참고).
-- ============================================================

ALTER TABLE arcades ADD COLUMN IF NOT EXISTS source     TEXT;
ALTER TABLE arcades ADD COLUMN IF NOT EXISTS source_ref TEXT;

-- 이름에 '(가상)' 이 남아 있는 행은 초기 예시 데이터입니다.
-- 수입 스크립트가 지워도 되는 행을 이 표시로 알아냅니다.
UPDATE arcades SET source = 'seed'
 WHERE source IS NULL AND name LIKE '%(가상)%';

CREATE UNIQUE INDEX IF NOT EXISTS arcades_source_ref_idx
  ON arcades (source_ref) WHERE source_ref IS NOT NULL;
