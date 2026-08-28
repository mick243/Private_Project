# 오락실 파인더 — 문서 세트

> 2026-08-25 작성. 기획서(`오락실파인더_기획서.html`) · Notion 개인프로젝트 1~5 · 커밋 기록 16건 · 코드베이스 전수 조사를 근거로 정리한 프로젝트 문서입니다.

| 문서 | 내용 |
|---|---|
| [DESIGN.md](DESIGN.md) | 설계 문서 — 왜 만들었나, 아키텍처, 데이터 모델 원칙, 계정/OAuth 설계, 챗봇·RAG, 실데이터 파이프라인, ADR, 열린 문제 |
| [COMPONENTS.md](COMPONENTS.md) | 컴포넌트 문서 — 28개 컴포넌트 + 클라이언트 훅 7개의 역할·props·상태·접근성 |
| [API-SPEC.md](API-SPEC.md) | API 명세 — 라우트 28개 / 핸들러 40개의 요청·응답·상태 코드·권한 규칙 |
| [PERF-A11Y-REPORT.md](PERF-A11Y-REPORT.md) | 성능·접근성 리포트 — 지도 최적화 실측(−75% CPU · −40% 힙), 접근성 감사(강점/격차 P1~P7) |
| [LOAD-TEST-REPORT.md](LOAD-TEST-REPORT.md) | 부하·성능 리포트 — k6 시나리오, 병목 진단, 개선 전후(p95 287→78ms, 천장 244→380 req/s) |

관련 원본 문서: [../PERFORMANCE.md](../PERFORMANCE.md)(조회 성능 개선 기록) · [../TESTING.md](../TESTING.md) · `../../오락실파인더_ERD_관계정리.md` · `../../RAG_적용_정리.md`
