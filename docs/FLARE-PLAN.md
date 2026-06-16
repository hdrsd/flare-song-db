# 후레아 노래 DB — 적용 계획

> 참조본 분석(`REFERENCE.md`) + 데이터 설계(`DATA-MODEL.md`)를 바탕으로 한
> **시라누이 후레아(不知火フレア) 전용** 적용 메모. 스택은 자유 선택, 데이터는 로컬 JSON, 언어는 ja/ko.

---

## 1. 대상 정보 (siteConfig 채울 값)

| 항목 | 값 |
|------|-----|
| 본명(표시) | 不知火フレア / 시라누이 후레아 |
| 소속 | 홀로라이브 **3기생** (hololive 3rd gen) · 유닛 ホロライブファンタジー (페코라·마린·노엘·루시아) |
| 채널 | YouTube `@ShiranuiFlare` (channelId `UCvInZx9h3jC2JzsIzoOebWg`, uploads `UUvInZx9h3jC2JzsIzoOebWg`) ✔확인됨 |
| X(Twitter) | @shiranui_flare |
| 관련 유닛 | フレアイリス(Flare×IRyS), ノエフレ(白銀ノエル×不知火フレア), 不知火建設(팬 유닛) |
| 사이트명(안) | Flare Song Database / 후레아 노래 DB |
| siteSlug | `flare-song-db` |

> ⚠️ 채널 핸들/링크/기념일은 **공개 정보로 직접 확인 후** 확정할 것 (위 값은 초안).

---

## 2. 후레아 고유 고려사항 (azki와 다른 점)

- **콜라보가 많다**: 노엘(白銀ノエル, ノエフレ), 3기생 ファンタジー(페코라·마린·노엘), IRyS(フレアイリス), 홀로 전체곡 등. → `sing`/`sings`, `tags`(유닛/게스트) 설계가 중요.
- **歌枠(노래방송) 비중**: 정규 노래방송에서 부른 커버가 데이터의 큰 축. → `tags: ["歌枠","커버"]` 조합.
- **멤버십 한정 노래방송**: 있으면 `isMembersOnly` 처리(MVP에서는 그냥 제외/표시 안 해도 됨).
- **오리지널곡**: 후레아 오리지널/유닛곡 → 디스코그래피 originals/collaborations로 분리.

---

## 3. 스택 선택 가이드 (다른 스택으로 갈 때)

핵심 3요소만 충족하면 어떤 스택이든 가능:

1. **정적 JSON 로드** — 빌드타임 import 또는 정적 파일 fetch.
2. **클라이언트 상태** — 즐겨찾기/플레이리스트/재생횟수 = localStorage.
3. **YouTube IFrame Player API** — `start`/`end` 구간 재생 제어.

| 후보 | 적합성 | 비고 |
|------|--------|------|
| Astro + 약간의 islands | ◎ | 정적 DB 사이트에 최적, 빠름, watch만 island로 |
| SvelteKit | ◎ | 가볍고 상태관리 간결 |
| Nuxt(Vue) | ○ | 풀기능 SPA/SSG |
| Next.js | ○ | 참조본과 동일(이식 쉬움) but 교체 의도와 배치 |
| 순수 Vite+React | ○ | 라우팅만 직접 |

> 추천: **데이터가 정적이고 서버 로직이 거의 없으므로 SSG 중심 스택(Astro/SvelteKit)** 이 잘 맞음.
> watch 페이지만 클라이언트 인터랙션이 무거우니 그 부분만 동적 컴포넌트로.

---

## 4. YouTube 구간 재생 — 구현 핵심 (스택 무관)

```
1) IFrame Player 로드: new YT.Player(el, { videoId })
2) 곡 선택 → player.seekTo(song.start, true); player.playVideo()
3) onStateChange/타이머로 currentTime 폴링 → currentTime >= song.end 이면
   → 다음 곡 로드(다른 영상이면 loadVideoById) 또는 정지
4) 곡 모드: end에서 다음 곡 / 영상 모드: 영상 끝까지
```
- 즐겨찾기/재생횟수/플레이리스트는 `song.id` 키로 localStorage 저장.
- 탭 간 동기화 원하면 `storage` 이벤트(참조본 useTabSync 역할).

---

## 5. 페이지 라우트 설계 (후레아)

| 라우트 | 내용 | 우선순위 |
|--------|------|----------|
| `/` | 홈: 소개 + 최근 추가 곡 + 바로가기 | MVP |
| `/songs` (= data) | 전체 곡 테이블(정렬/필터/가상스크롤) | MVP |
| `/search` | 검색 (q: 필드 문법, 태그/아티스트 뱃지 클릭) | MVP |
| `/watch` | YouTube 임베드 + 구간 재생 + 플레이리스트 | MVP |
| `/discography/{originals,covers,collaborations,albums}` | 분류별 | 2단계 |
| `/playlist` | 로컬 플레이리스트 | 2단계 |
| `/statistics` | 연도별/조회수/마일스톤 | 3단계 |
| `/summary`,`/anniversaries` | 활동요약/기념일 | 3단계 |
| `/share` | 베스트9/OG 이미지 | 마감 |

---

## 6. 다국어 (ja/ko)

- UI 문자열: `messages/ja.json`, `messages/ko.json` (참조본 en.json 구조 차용).
- 곡 데이터: `hl.ja` 필수, `hl.ko` 선택 → 로케일에 따라 표시, ko 없으면 ja 폴백.
- 일본어 곡명은 한글 번역이 없을 수 있으니 **ja 폴백을 기본 규칙**으로.

---

## 7. 작업 순서 (제안)

1. 스택 결정 → 프로젝트 스캐폴딩 (`f:\flare` 안에).
2. `DATA-MODEL.md`의 Song 타입 + 샘플 `songs.json`(곡 5~10개) 작성.
3. `/songs` 목록 + `/search` 검색 (정적 JSON만으로 동작 확인).
4. `/watch` 구간 재생 (가장 어려운 핵심부) — 곡 1개 → 연속 재생.
5. 분류 규칙(`filters`) + 디스코그래피.
6. localStorage 개인화(즐겨찾기/플레이리스트/재생횟수).
7. 다국어 → 통계/공유 → PWA 순.

---

## 8. 법적/매너 (참조본도 명시)

- **비공식 팬 사이트** 명시(disclaimer), 홀로라이브/커버 가이드라인 준수.
- 영상은 **임베드만**(다운로드/재업로드 X), 원본 채널로 유입되게 링크.
- 멤버십 한정 콘텐츠 타임스탬프 공개는 신중히(가이드라인 확인).
- 라이선스: 코드 MIT 등 자유, 데이터는 팬 정리물임을 표기.

---

## 9. 호스팅 & 자동화 (결정 반영)

**호스팅: Cloudflare Pages (SSG) — 트래픽 $0.**
- 정적 사이트 → 대역폭·요청 무제한 무료.
- 프레임워크는 Cloudflare 어댑터 있는 SSG 스택(**Astro** `@astrojs/cloudflare` / **SvelteKit** `@sveltejs/adapter-cloudflare`).
- ⚠️ **Cloudflare Workers는 Node.js 런타임이 아님**(workerd/V8 isolate). `express` 등 Node 서버 불가 →
  서버 코드가 필요하면 웹 표준 `fetch` 기반으로 작성. **Node.js는 빌드타임 도구로만** 사용.
- "진짜 Node 서버"를 고집하면 Cloudflare가 아닌 별도 호스팅 필요 → $0 목표와 멀어짐. 이 프로젝트는 런타임 백엔드를 없애는 게 최선.

**자동화: 별도 Cron Worker (상세 → `AUTOMATION.md`).**
- 매일 00:00(KST=15:00 UTC) 전체 스윕 + 방송 종료 +5h 댓글 파싱.
- YouTube Data API(무료 한도) 사용, **Twitter는 유료($200/월)라 제외 → 콜라보는 YouTube로 탐지**.
- 자동 파싱 결과는 **후보** → GitHub PR 리뷰 → 머지 시 Pages 재빌드. 런타임은 끝까지 정적.

## 다음 액션

원하시면:
- (a) 스택을 정해주시면 그 스택으로 **프로젝트 스캐폴딩 + 샘플 songs.json + /songs·/search·/watch MVP** 를 바로 만들어 드림.
- (b) 우선 `songs.json` 스키마와 샘플 데이터부터 같이 확정.
- (c) 빌드 스크립트(CSV/시트 → songs.json) 부터.
