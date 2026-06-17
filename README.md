# 🔥 Flare Song Database

시라누이 후레아(不知火フレア / hololive 3rd gen)가 부른 노래를 모아 정리한 **비공식 팬 데이터베이스**.
노래방송(歌枠)에서 부른 커버, 오리지널 MV, 콜라보·유닛곡을 YouTube 타임스탬프와 함께 검색·재생합니다.

- **사이트**: https://song.flare.moe
- 정적 사이트(Astro) · 로컬 JSON 데이터 · ja/ko 다국어 · Cloudflare Pages(트래픽 $0)

> ⚠️ 팬이 운영하는 비공식 사이트입니다. 영상은 YouTube 공식 채널로 임베드/연결만 하며, 홀로라이브 이차창작 가이드라인을 따릅니다.

---

## 주요 기능

- **목록 `/songs`** — 빠른 텍스트 필터 + 연도/태그 칩 + 정렬(최신·오래된·제목·길이), 더보기 페이지네이션
- **검색 `/search`** — 필드 접두사 문법(`title:` `artist:` `sing:` `tag:` `year:`) + 제외(`-`), 태그 facet
- **재생 `/watch`** — YouTube IFrame 임베드 + **곡 구간(start~end) 재생**, 곡모드 시 끝나면 다음 곡 자동, `?id=` 딥링크
- ja/ko 다국어, 썸네일에 곡 제목 오버레이, YouTube 썸네일 폴백 체인

## 데이터 현황

약 **2,790곡** (2020-06 ~ 현재) — YouTube에서 자동 수집 + 일부 수동 시드.

| 소스 | 내용 | 태그 |
|------|------|------|
| `utawaku` | 노래방송 세트리스트 댓글 파싱 (커버) | `歌枠` `커버` |
| `original` | 메인 채널 official MV | `오리지널` (+`유닛`/`콜라보`) |
| `seed` | 채널 밖 영상(홀로 전체곡·유닛곡 등) 수동 추가 | `홀로전체곡` `콜라보` `유닛` … |

## 기술 스택

Astro 5 (정적 출력) · TypeScript · 바닐라 JS(클라이언트 인터랙션) · YouTube IFrame Player API · Node.js(빌드·수집 도구) · Cloudflare Pages.

---

## 개발

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # dist/ 정적 산출물
npm run preview  # 빌드 결과 미리보기
npm run check    # 타입 체크
```

## 프로젝트 구조

```
src/
  data/songs.json            # 곡 데이터(수집 결과, 사이트의 단일 소스)
  types/song.ts              # Song 타입
  lib/song.ts                # 서버 전용: 로드·분류·toCompact (songs.json import)
  lib/songs.shared.ts        # 클라/서버 공용: 검색·카드렌더·유틸 (데이터 미포함)
  lib/i18n.ts                # ja/ko UI 문자열
  components/                # Layout, SongCard, pages/*
  pages/                     # ja: /, /songs, /search, /watch
  pages/songs-index.json.ts  #   compact 인덱스(정적 JSON) — 클라이언트가 fetch
  pages/ko/                  # ko: /ko, /ko/songs, /ko/songs-index.json ...
scripts/                     # YouTube 수집 파이프라인(빌드타임)
data/seed.songs.json         # 수동 시드(채널 밖 영상)
docs/                        # 설계 문서
```

## 성능 설계

곡이 수천 개라 페이지에 전부 인라인하지 않는다:

- **compact 인덱스** — `songs.json`(~1.9MB)을 번들하지 않고, 검색/표시 필드만 담은
  `/songs-index.json`(~540KB, **gzip ~98KB**)을 빌드 정적 생성 → 클라이언트가 1회 `fetch`(CDN 캐시).
- **클라이언트 렌더링** — `/songs`·`/search`·`/watch`가 같은 인덱스를 공유해 렌더 →
  페이지 HTML·JS 각 1~3KB. (예: `/songs` HTML 1.8MB → 1.5KB)

---

## 데이터 수집

`src/data/songs.json`은 YouTube에서 수집한 실데이터다. 키는 `.dev.vars`의 `YOUTUBE_API_KEY`(커밋 금지).

```bash
npm run ingest -- --scan 2000 --max 9999   # 노래방송(歌枠) 세트리스트 댓글 파싱
npm run ingest:originals -- --scan 2000    # 오리지널/콜라보/유닛 (메인채널 official MV)
npm run ingest:seed                        # 수동 시드(data/seed.songs.json)
# 미리보기: 위 명령에 --dry 추가 (파일 미기록)
```

- 세 수집기는 **소스별로 독립 병합**(`scripts/store.mjs`) — 각자 자기 `source`(`utawaku`/`original`/`seed`)
  곡만 교체하고 다른 소스는 보존. 순서 무관·재실행 안전(idempotent).
- **수동 시드**: 후레아 채널 밖 영상(SSS·Capture the Moment 등 홀로 전체곡, ファンタジー/ノエフレ 유닛곡)은
  자동 검출이 안 되므로 `data/seed.songs.json`에 `{ videoId, title, artist, sing, tags }`로 추가
  (제목·길이·공개일은 `videoId`로 API 자동 보강).

| 스크립트 | 역할 |
|----------|------|
| `parseSetlist.mjs` | 세트리스트 텍스트 → 곡 파서 (순수 함수, 키 불필요) |
| `youtube.mjs` | YouTube Data API fetch (웹 표준 — Cloudflare Worker 이식 가능) |
| `ingest*.mjs` | 노래방송 / 오리지널 / 시드 오케스트레이터 |
| `store.mjs` | 소스별 병합·dedupe·정렬 저장 |

> ⚠️ 자동 파싱은 **후보**다. 곡명/구간 오인이 있을 수 있으니 커밋 전 가볍게 검토 권장.
> 곡 수동 추가 = `id = "{videoId}_{start초}"` 규칙 유지. 스키마는 [docs/DATA-MODEL.md](docs/DATA-MODEL.md) 참조.

설계 상세: [docs/AUTOMATION.md](docs/AUTOMATION.md)

---

## 배포 (Cloudflare Pages + GitHub)

저장소를 Cloudflare Pages에 연결하면 `git push`마다 자동 빌드·배포된다.

| 설정 | 값 |
|------|-----|
| Framework preset | Astro |
| Build command | `npm run build` |
| Build output | `dist` |
| 환경변수 | `NODE_VERSION` = `22` (`.nvmrc`로도 처리) |

런타임 시크릿 없음 — `YOUTUBE_API_KEY`는 로컬 수집에만 쓰이고 사이트에 포함되지 않는다.
로컬에서 직접 배포: `npm run deploy` (`wrangler login` 필요).

---

## 로드맵

- 디스코그래피(오리지널/커버/콜라보) 분류 페이지
- localStorage 즐겨찾기·플레이리스트·재생횟수
- 콜라보 방송 탐지(다른 멤버 채널 스캔)
- 자동 수집 Cron Worker(매일/방송 종료 후) — [docs/AUTOMATION.md](docs/AUTOMATION.md)
- 통계 · OG 이미지 · PWA

## 라이선스 / 크레딧

코드는 자유롭게 참고 가능. 곡 데이터는 팬이 정리한 비공식 자료이며, 모든 영상·음원의 권리는 원저작자 및 홀로라이브(COVER 주식회사)에 있습니다. 참조 구조: [mitsugogo/azki-song-db](https://github.com/mitsugogo/azki-song-db).
