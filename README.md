# 🔥 Flare Song Database (후레아 노래 DB)

시라누이 후레아(不知火フレア)가 부른 노래를 정리하는 **비공식 팬 데이터베이스**.
정적 사이트(Astro) + 로컬 JSON + ja/ko 다국어. Cloudflare Pages 배포(트래픽 $0) 전제.

> 설계 문서: [docs/](docs/) — REFERENCE / DATA-MODEL / FLARE-PLAN / AUTOMATION

## 개발

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # dist/ 정적 산출물
npm run preview  # 빌드 결과 미리보기
```

## 구조

```
src/
  data/songs.json        # ★ 곡 데이터 (현재 샘플/placeholder)
  types/song.ts          # Song 타입
  lib/song.ts            # 서버 전용: 로드·분류·toCompact (songs.json import)
  lib/songs.shared.ts    # 클라이언트/서버 공용: 검색·카드렌더·유틸 (데이터 미포함)
  lib/i18n.ts            # ja/ko UI 문자열
  components/            # Layout, SongCard, pages/*
  pages/                 # ja: /, /songs, /search, /watch
  pages/songs-index.json.ts  # compact 인덱스(정적 JSON) — 클라이언트가 fetch
  pages/ko/              # ko: /ko, /ko/songs, /ko/songs-index.json ...
public/                  # favicon, (선택)/albums 앨범아트
docs/                    # 설계 문서
```

## 성능 설계 (대용량 대응)

곡이 수천 개라 페이지에 전부 인라인하지 않는다:

- **compact 인덱스**: `songs.json`(1.9MB)을 번들하지 않고, 검색/표시 필드만 담은
  `/songs-index.json`(537KB, **gzip 98KB**)을 빌드 정적 생성 → 클라이언트가 1회 `fetch`(CDN 캐시).
- **클라이언트 렌더링**: `/songs`(더보기+연도필터)·`/search`·`/watch` 큐를 인덱스 기반으로 렌더 →
  페이지 HTML 1.5~2KB, 페이지 JS 1~3KB. (이전 `/songs` HTML 1.8MB → 1.5KB)
- 셋이 같은 인덱스를 공유 → 한 번 받으면 전 페이지 즉시.

## 현재 구현 (MVP)

- `/` 홈 — 최근 추가 곡
- `/songs` 전체 목록 (방송일 최신순, 카드 그리드)
- `/search` 검색 — 필드 접두사(`title:` `artist:` `sing:` `tag:` `year:` `milestone:`) + 제외(`-`), 태그 facet
- `/watch` 재생 — YouTube IFrame 임베드 + **곡 구간(start~end) 재생**, 곡모드 시 end에서 다음 곡 자동 진행
- ja/ko 다국어, YouTube 썸네일(폴백 체인), 앨범아트 폴백

## 데이터 수집 (자동)

`src/data/songs.json`은 **YouTube에서 자동 수집한 실데이터**입니다(노래방송 세트리스트 댓글 파싱).

```bash
# .dev.vars 에 YOUTUBE_API_KEY 설정 후 (커밋 금지)
npm run ingest -- --scan 2000 --max 9999   # 노래방송(歌枠) — 세트리스트 댓글 파싱
npm run ingest:originals -- --scan 2000    # 오리지널/콜라보/유닛 — 메인채널 official MV
npm run ingest:seed                        # 수동 시드 — 홀로 전체곡/유닛 등 채널 밖 영상
npm run ingest:originals -- --dry          # 미리보기(파일 미기록)
```

세 수집기는 **소스별로 독립 병합**된다(`scripts/store.mjs`): 각자 `source`(`utawaku`/`original`/`seed`)가
같은 곡만 교체하고 다른 소스 데이터는 보존한다. 순서 무관·재실행 안전(idempotent).

**수동 시드**(`data/seed.songs.json`): 후레아 채널 밖 영상(SSS·Capture the Moment 등 홀로 전체곡,
ファンタジー/ノエフレ 유닛곡)은 자동 검출이 안 되므로 `{ videoId, title, artist, sing, tags }`로 직접 추가.
제목·길이·공개일은 `videoId`로 API 자동 보강. `npm run ingest:seed` 로 반영.

파이프라인: 업로드 스캔 → `歌枠` 필터 → 댓글에서 세트리스트 댓글 선별 →
타임스탬프 파싱(`scripts/parseSetlist.mjs`) → 잡담/MC 구간 제거 → `Song[]` 생성 → 저장.

- `scripts/parseSetlist.mjs` — 세트리스트 텍스트 → 곡 파서 (순수 함수, 키 불필요)
- `scripts/youtube.mjs` — YouTube Data API fetch (웹 표준, 워커 이식 가능)
- `scripts/ingest.mjs` — 오케스트레이터
- 설계: [docs/AUTOMATION.md](docs/AUTOMATION.md)

> ⚠️ 자동 파싱은 **후보**입니다. 곡명/구간 오인이 있을 수 있으니 커밋 전 검토 권장.
> 곡 수동 추가 = `songs.json`에 객체 1개 추가, `id = "{videoId}_{start초}"` 규칙 유지.
> 스키마는 [docs/DATA-MODEL.md](docs/DATA-MODEL.md) 참조.

### ⚠️ API 키 보안
`.dev.vars`(gitignored)에만 보관하고 **절대 커밋 금지**. 채팅/PR 등에 노출됐다면
Google Cloud Console에서 **키 회전(재발급)** 하세요.

## 다음 단계 (로드맵)

- 디스코그래피(오리/커버/콜라보) 분류 페이지
- 즐겨찾기·플레이리스트·재생횟수(localStorage)
- 자동 수집 Cron Worker (YouTube 댓글 타임스탬프 / 신곡 / 콜라보) — [docs/AUTOMATION.md](docs/AUTOMATION.md)
- 통계 / OG 이미지 / PWA
