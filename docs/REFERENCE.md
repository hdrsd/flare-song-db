# 참조 프로젝트 분석 — AZKi Song Database

> 출처: https://github.com/mitsugogo/azki-song-db
> 목적: 시라누이 후레아(不知火フレア) 노래 DB 사이트를 **다른 스택으로** 재구축하기 위한 구조 레퍼런스.
> 이 문서는 "무엇을/왜" 만들었는지에 집중한다. 스택 종속적인 부분(Next.js, Google Sheets)은 후레아 버전에서 대체할 지점을 명시한다.

---

## 1. 한눈에 보기

특정 버튜버가 **방송 노래방(歌枠)·오리지널 곡·커버·콜라보·기념 라이브**에서 부른 곡을
YouTube 영상의 **시작/종료 타임스탬프**와 함께 정리하고, 검색·재생·통계까지 제공하는 팬 사이트.

핵심 아이디어 3가지:

1. **곡 = (YouTube 영상 ID + start초 + end초) + 메타데이터** 한 줄로 표현.
   → 영상 임베드 후 `start`로 점프하면 그 곡만 바로 재생됨.
2. **데이터와 코드 분리.** 원본은 Google Sheets에 비개발자가 입력 → API가 읽어서 JSON으로 가공.
   → 후레아 버전은 이 자리를 **로컬 JSON 파일**로 대체.
3. **곡 분류는 태그 기반.** `オリ曲`(오리곡), `カバー曲`(커버), `ユニット曲`(유닛), `fes全体曲` 등의
   태그 조합으로 오리지널/커버/콜라보를 런타임에 판별.

---

## 2. 기술 스택 (참조본)

| 영역 | 사용 기술 | 후레아 버전에서 |
|------|-----------|-----------------|
| 프레임워크 | Next.js 16 (App Router) + React 19 | **자유 선택** (Next/Nuxt/SvelteKit/Astro 등) |
| 언어 | TypeScript | 권장 유지 |
| 스타일 | Tailwind CSS + Mantine + 일부 MUI | 자유 |
| 데이터 백엔드 | **Google Sheets API** | **로컬 JSON/CSV로 대체** |
| 영상 메타/조회수 | YouTube Data API v3 | 선택 (조회수 통계 원할 때만) |
| 영상 재생 | react-youtube (IFrame Player API) | YouTube IFrame API 직접/래퍼 |
| 다국어 | next-intl (ja/en) | **ja/ko 다국어** |
| 표/가상스크롤 | @tanstack/react-table + react-virtual | 자유 (곡 수천 개 → 가상스크롤 권장) |
| 드래그앤드롭 | dnd-kit (플레이리스트 정렬) | 선택 |
| 차트 | Recharts (통계) | 선택 |
| 배포 | Vercel (CDN 캐시 태그 활용) | 자유 |
| PWA | manifest + service worker | 선택 |

> 핵심: 프레임워크/스타일은 전부 교체 가능. **불변 핵심은 "데이터 모델 + 곡 분류 규칙 + watch 재생 로직"** 세 가지다.

---

## 3. 디렉토리 구조 (src/app, App Router)

```
src/
├─ app/
│  ├─ page.tsx                # 홈 (랜딩 + 최근 업데이트 등)
│  ├─ layout.tsx              # 공통 레이아웃/메타데이터
│  ├─ data/                   # 전체 곡 목록 테이블 (정렬/필터/가상스크롤)
│  ├─ search/                 # 검색 (고급 쿼리 q: 문법)
│  ├─ watch/                  # ★ 핵심: YouTube 임베드 + 타임스탬프 재생 플레이어
│  ├─ discography/            # 디스코그래피 (originals/covers/collaborations/albums)
│  ├─ playlist/               # 로컬 플레이리스트 (localStorage)
│  ├─ statistics/             # 통계 (연도별/조회수/마일스톤 차트)
│  ├─ summary/                # 활동 요약 (연도별, 기념일 카운트다운, 이벤트)
│  ├─ anniversaries/          # 기념일
│  ├─ share/                  # 공유 기능 (베스트9 곡 픽커, OG 이미지)
│  ├─ unlock-members/         # 멤버십 한정곡 잠금 해제
│  ├─ api/                    # 서버 라우트 (아래 4장)
│  ├─ components/             # 공통 컴포넌트 (플레이어/헤더/리스트 등)
│  ├─ hook/                   # 커스텀 훅 (데이터/플레이어/즐겨찾기 등)
│  ├─ lib/                    # 유틸 (slug, 날짜포맷, 검색, 캐시태그 등)
│  ├─ config/                 # siteConfig, filters(곡 분류 규칙)
│  ├─ context/                # React Context
│  └─ types/                  # 타입 정의 (song, event, anniversary 등)
├─ i18n/                      # next-intl 라우팅 설정
└─ messages/                  # ja.json, en.json (UI 번역)
```

후레아 버전에서 **반드시 가져갈 페이지(MVP)**: `data`(목록), `search`(검색), `watch`(재생).
나머지(statistics/summary/share/playlist/멤버십)는 단계적 추가.

---

## 4. 데이터 흐름 (참조본 → 후레아 대응)

### 참조본
```
Google Sheets (여러 탭)
   │  Google Sheets API (includeGridData)
   ▼
/api/songs/route.tsx  ← 시트 → Song[] 변환 (헤더 별칭 매핑, 날짜 시리얼 변환, hyperlink 추출)
   │  JSON + Cache-Control(s-maxage=86400)
   ▼
useSongs() 훅  ← fetch + 메모리 캐시 + 로케일별 캐시
   ▼
각 페이지 (data/search/watch...)
```

핵심 변환 로직 (`/api/songs/route.tsx`):
- 시트 탭별로 컬럼 헤더를 **별칭 스키마(HEADER_SCHEMA)**로 매핑 → 시트 컬럼명이 한/영 섞여 있어도 흡수.
- B열 = "유효(Enabled)" 불리언 체크 → FALSE면 스킵 (운영 중 임시 숨김용).
- Google 시리얼 날짜값 → ISO 문자열 변환, 시간값(0~1) → 초 변환.
- `=HYPERLINK(...)` 셀에서 **hyperlink만 추출** → video_uri, 거기서 정규식으로 video_id 파싱.
- `artists`, `song_titles` 시트는 **번역 맵**으로 먼저 로드 → ja→en 치환에 사용.
- 최종 정렬: 앨범곡은 발매일, 그 외는 방송일 기준 **내림차순(최신순)**.

### 후레아 버전
```
data/songs.json  (또는 songs.ja.json + 번역 맵)
   │  빌드타임 import 또는 정적 fetch
   ▼
(변환 불필요 — 이미 가공된 형태로 저장)
   ▼
각 페이지
```
→ Sheets의 런타임 변환 로직 전체가 **불필요**해진다. 대신 JSON을 곧바로 Song 모양으로 저장.
시트로 편집하고 싶으면 **빌드 스크립트(CSV/시트 → songs.json)**를 따로 두는 방식 권장(아래 DATA-MODEL.md).

---

## 5. API 라우트 (참조본) — 대부분 후레아에서 불필요

| 라우트 | 역할 | 후레아 버전 |
|--------|------|-------------|
| `/api/songs` | 시트 → Song[] | **제거**(JSON 직접 로드) |
| `/api/yt/*` | YouTube Data API (채널/영상/조회수) | 통계 원할 때만 |
| `/api/stat/views/*` | 조회수 통계 | 선택 |
| `/api/anniversaries`, `/api/events`, `/api/milestones` | 부가 데이터(시트) | JSON으로 대체 |
| `/api/og/*` | OG 이미지 동적 생성 (@vercel/og) | 선택 (공유 미려함용) |
| `/api/members-only-access`, `/api/share/my-best-9-songs` | 멤버십/공유 | 후순위 |

> 정적 데이터 + 클라이언트 렌더 구조라 **서버 라우트 없이도** 핵심 기능(목록/검색/재생)은 전부 동작 가능.

---

## 6. 곡 분류 규칙 (config/filters) — ★ 반드시 이해할 것

태그/아티스트 문자열로 곡 종류를 판별한다. 후레아용으로 **태그 체계만 바꾸면 그대로 차용 가능**.

- **오리지널곡**: 태그에 `オリ曲`/`オリ曲MV` 포함 + 아티스트에 본인명 포함 + (특정 예외 제목 제외).
- **콜라보곡**: 오리곡 태그 + (`ユニット曲`/`ゲスト参加`/`fes全体曲` 등) → 유닛/게스트/페스 전체곡.
- **커버곡**: 태그에 `カバー曲`.
- **fes 전체곡**: `fes全体曲` 태그 + 부른사람(sing)에 본인 포함.

→ 디스코그래피 페이지(`/discography/originals|covers|collaborations`)와 검색 필터가 이 규칙을 공유.
→ **후레아 태그 예시**: `오리지널`, `커버`, `유닛(예: 폴카+후레아)`, `홀로라이브 전체곡`, `게스트` 등으로 매핑.

---

## 7. 검색 문법 (search) — 차용 가치 높음

URL 쿼리 `?q=` 에 **필드 접두사** 문법을 지원:

| 접두사 | 의미 | 예 |
|--------|------|-----|
| `title:` | 곡 제목 | `title:Stardust` |
| `artist:` | 아티스트 | `artist:Flare` |
| `sing:` | 부른 사람 | `sing:Polka` |
| `tag:` | 태그 | `tag:커버` |
| `milestone:` | 마일스톤 | `milestone:1주년` |
| `year:` | 연도 | `year:2024` |

- 접두사 없는 키워드는 전체 텍스트 검색.
- **AND/OR/제외/완전일치** 옵션 지원 (고급 검색 모달 `AdvancedSearchModal`).
- 곡 목록의 태그/아티스트 뱃지를 클릭하면 해당 `q=field:value` 링크로 이동 → 탐색이 자연스러움.

후레아 버전에서도 이 "필드 접두사 + 뱃지 클릭 → 검색" UX는 그대로 채택 권장.

---

## 8. watch 페이지 — ★ 사이트의 심장

YouTube IFrame Player로 영상을 띄우고, 선택한 곡의 `start`초로 점프 → `end`초에서 다음 곡.

주요 기능(컴포넌트/훅 기준):
- `MainPlayer` / `SharedYouTubePlayer` / `MiniPlayer`: 메인/미니 플레이어.
- `PlayerControlsBar`, `SongModeControls`: 재생 컨트롤, 곡 단위 vs 영상 단위 재생 모드.
- `useFavorites`(즐겨찾기), `useSongPlayCounts`(로컬 재생 횟수), `usePlaylists`(localStorage 플레이리스트).
- `useGlobalPlayer`, `usePlayerVolume`, `useBackgroundAudio`, `useTabSync`(탭 간 동기화).
- 랜덤 재생, 곡 모드(해당 구간만), 영상 모드(영상 전체).

> 데이터 소스와 무관한 순수 클라이언트 로직 → **JSON 기반 후레아 버전에서 거의 그대로 이식 가능**.

---

## 9. 주요 컴포넌트/훅 목록 (참고용)

**컴포넌트**: Header, Footer, DrawerMenu, LanguageSwitcher, ThemeToggle,
SongList/SongListItem, SearchInput/SearchAndSongList, MainPlayer/MiniPlayer/PlayerControlsBar,
NowPlayingSongInfo(Detail), MilestoneBadge, ShareModal, YoutubeThumbnail, YearPager.

**훅**: useSongs(전체곡), useSearch, useFavorites, usePlaylists, useSongPlayCounts,
useGlobalPlayer/usePlayerControls/usePlayerVolume, useStatistics/useStatViewCounts,
useAnniversaries/useEvents/useMilestones/useChannels, usePWAInstall.

---

## 10. 후레아 버전 권장 단계 (스택 무관)

1. **MVP**: 데이터 모델 확정(JSON) → 목록 페이지 → 검색 → watch 재생.
2. **분류/탐색**: 태그 기반 디스코그래피(오리/커버/콜라보), 태그·아티스트 뱃지 검색.
3. **개인화**: 즐겨찾기 + 로컬 플레이리스트 + 재생횟수(localStorage).
4. **부가**: 통계(연도별/조회수), 기념일/이벤트, 다국어(ja/ko).
5. **마감**: OG 이미지, PWA, 공유 기능.

→ 데이터 스키마는 `DATA-MODEL.md`, 후레아 고유 적용은 `FLARE-PLAN.md` 참조.
