/**
 * 검색창의 "대충 친 지역 이름" 을 좌표로 바꾸는 쪽의 순수 로직.
 *
 * "강남역" · "역삼동" · "테헤란로" 같은 입력은 오락실 이름/주소와 안 맞을 수
 * 있습니다. 그럴 때 네이버 지역 검색(lib/naver-local.ts searchLocal)에 그대로
 * 물어보고, 첫 번째로 좌표가 성한 결과를 "그 지역" 으로 삼습니다 — 지역 검색은
 * 역·동·도로명·상호를 다 알아듣고, 어떤 결과든 그 지역 안의 좌표를 줍니다.
 *
 * HTTP 호출은 API 라우트(app/api/places)가 하고, 여기는 응답을 고르는 판단만
 * 둡니다 — 네트워크 없이 테스트하기 위해서입니다.
 */

// 확장자를 붙이는 이유는 naver-local.ts 상단 주석과 같습니다 — 이 계보의
// 파일은 Node 로 직접 실행되는 스크립트에서도 쓰입니다.
import { stripTags, toLatLng, type NaverLocalItem } from './naver-local.ts';

export interface Place {
  name: string;
  address: string;
  lat: number;
  lng: number;
}

/**
 * 지역 검색 결과에서 지도를 옮길 한 곳을 고릅니다.
 *
 * 첫 결과가 아니라 **첫 번째로 좌표가 성한** 결과인 이유: mapx/mapy 가 비거나
 * 한반도 밖인 항목이 실제로 옵니다 (toLatLng 가 null 을 돌려주는 경우).
 * 그런 항목 때문에 전체를 실패로 만들면 멀쩡한 두 번째 결과를 버리게 됩니다.
 */
export function pickPlace(items: NaverLocalItem[]): Place | null {
  for (const item of items) {
    const coord = toLatLng(item.mapx, item.mapy);
    if (!coord) continue;
    const name = stripTags(item.title).trim();
    if (!name) continue;
    return {
      name,
      address: item.roadAddress || item.address || '',
      lat: coord.lat,
      lng: coord.lng,
    };
  }
  return null;
}

/**
 * 검색어가 지역 검색에 물어볼 만한 모양인지.
 *
 * 한 글자는 물어보지 않습니다 — "강" 으로도 결과는 오지만 어디로 옮길지가
 * 사실상 무작위입니다. 상한은 지역 검색이 받는 질의 길이를 넉넉히 밑돕니다.
 */
export function isPlaceQuery(q: string): boolean {
  const t = q.trim();
  return t.length >= 2 && t.length <= 60;
}

/**
 * **시 단위** 지역 검색인가 — '청주시' · '경기 평택시' 처럼 시로 끝나는 검색어.
 *
 * 이런 검색은 "그 도시에 뭐가 있나" 를 보러 온 것이지 지점 하나를 찾는 게
 * 아닙니다. 그런데 이름·주소 매치가 하나라도 있으면 검색 버튼이 그 한 곳으로
 * 당겨 버려서(SPOT_ZOOM 18), 도시를 보러 온 사람이 낯선 골목에 떨어지고
 * 그 지점만 선택된 채 남습니다. 그래서 이 모양일 때는 지점 매치를 건너뛰고
 * 지역 이동만 합니다 — 선택 없이, 시가 한눈에 드는 줌으로.
 *
 * '청주시 상당구' 처럼 뒤에 구·동·로가 붙은 검색어는 해당하지 않습니다
 * (시로 끝나지 않음). 그건 이미 시보다 좁혀 들어간 것이라 지점 매치가
 * 쓸모 있습니다.
 */
export function isCityQuery(q: string): boolean {
  return /시$/.test(q.trim());
}
