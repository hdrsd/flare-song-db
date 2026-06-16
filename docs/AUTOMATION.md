# 자동 수집/갱신 파이프라인 — 후레아 노래 DB

> 추가 요청 기능 검토: ①YouTube 댓글 타임스탬프 파싱 ②콜라보 방송 추적 ③신곡 자동 업데이트.
> 전제: 실시간 X. **매일 00:00** 전체 스윕 + **방송 종료 5시간 뒤** 타임스탬프 파싱.
> 목표 비용 $0 유지 → Cloudflare Cron Workers + YouTube API(무료 한도) + GitHub PR 리뷰 게이트.

---

## 0. 결론 요약

| 기능 | 타당성 | 방식 |
|------|--------|------|
| ① 댓글 타임스탬프 파싱 | ✅ 가능 | YouTube `commentThreads` → 세트리스트 댓글 탐지 → 정규식 파싱 → 리뷰 큐 |
| ② 콜라보 추적 | ✅ 확정 | **Twitter 제외(결정). YouTube 메타데이터로 콜라보 탐지** |
| ③ 신곡 자동 업데이트 | ✅ 가능 | 업로드 재생목록 감시 → 오리지널 휴리스틱 → 리뷰 큐 |

핵심 원칙: **자동 파싱은 "후보(candidate)"만 만든다. 사람이 승인해야 published.** (데이터 품질 + $0 + 되돌리기)

---

## 1. 비용 점검 (목표 $0)

| 항목 | 비용 | 한도 |
|------|------|------|
| Cloudflare Pages (정적) | $0 | 대역폭/요청 무제한 |
| Cloudflare Cron Workers | $0 | 10만 req/일, 크론 트리거 무료 |
| YouTube Data API v3 | $0 | 10,000 units/일 (스윕은 수백 units) |
| GitHub (데이터 PR) | $0 | |
| 썸네일/앨범아트 | $0 | i.ytimg.com 등 외부 CDN 직접링크, 내 대역폭/quota 미사용 |
| **X(Twitter) API** | ❌ 월 $200~ | 무료 티어는 읽기/검색 불가 → **사용 안 함** |
| LLM 파싱(선택) | ~수 센트/일 | 정규식 우선, 애매한 댓글만 |

YouTube quota 예산(일):
- 업로드 감시: `playlistItems.list` 1u × 채널수
- 콜라보 채널 스캔: 1u × 채널수
- 방송 메타: `videos.list` 1u × 신규영상
- 댓글 수집: `commentThreads.list` 1u × 처리대상영상(페이지당)
→ 합쳐도 수백 units. 10,000 한도 대비 여유.

---

## 2. 스케줄링 (Cloudflare Cron Triggers)

KST/JST = UTC+9 → 00:00 KST = **15:00 UTC**.

```toml
# wrangler.toml
[triggers]
crons = [
  "0 15 * * *",     # 매일 00:00 KST — 전체 스윕(신곡/콜라보)
  "*/30 * * * *"    # 30분마다 — "방송 종료 +5h 경과 & 미처리" 검사
]
```

**"방송 종료 +5h" 처리 방식**: Workers는 장시간 sleep 불가 → 타이머 대신 **스윕**.
1. 신규 아카이브 영상 발견 시 `videos.list(part=liveStreamingDetails)`로 `actualEndTime` 기록 → 큐에 `pending` 저장.
2. 30분 크론이 `now >= actualEndTime + 5h && status==pending` 인 항목을 골라 댓글 파싱 실행.
3. 처리 후 `status=parsed`.
> 5h 지연 이유: 아카이브 인코딩 완료 + 팬/본인의 세트리스트 댓글이 보통 몇 시간 내 올라오기 때문.
> 정밀 타이머가 꼭 필요하면 Durable Object `alarm()`으로 정확히 +5h 예약 가능(과한 편).

---

## 3. 파이프라인 ① — 댓글 타임스탬프 파싱

```
대상 영상(아카이브) 결정 (종료+5h 경과)
   ▼
commentThreads.list(videoId, order=relevance, maxResults=100)   # 필요 시 페이지네이션
   ▼
세트리스트 댓글 선별 (점수화)
   ▼
타임코드 라인 파싱 → [{start, text}]
   ▼
text → {title, artist} 정규화
   ▼
end = 다음 항목 start (마지막은 영상 끝/공백)
   ▼
Song 후보 생성 → 리뷰 큐(staging)
```

### 세트리스트 댓글 선별 (휴리스틱 점수)
- +가산: 고정(pinned) 댓글 / 채널 소유자 댓글 / 키워드 포함(`セトリ`,`セットリスト`,`目次`,`タイムスタンプ`,`setlist`,`歌った曲`)
- +가산: 타임코드(`\d:\d\d`) 라인 수가 많을수록
- 최고점 댓글을 세트리스트로 채택(없으면 스킵 → 수동).

### 타임코드 파싱 정규식
```ts
// "0:12:34 曲名 / アーティスト" / "12:34 曲名 - Artist" / "1:02:03 曲名"
const LINE = /^[^\d]*((?:\d{1,2}:)?\d{1,2}:\d{2})\s*[-–~|/]?\s*(.+?)\s*$/;
function toSeconds(tc: string) {
  const p = tc.split(":").map(Number);
  return p.length === 3 ? p[0]*3600 + p[1]*60 + p[2] : p[0]*60 + p[1];
}
// title/artist 분리: " / " | " - " | "（）" 기준, 실패 시 전체를 title로
```
- ⚠️ 한계: 잡담·챕터·인사 구간이 곡으로 오인될 수 있음 → **리뷰에서 제거**.
- 선택: 애매한 라인만 LLM(Claude)로 "이게 곡인가? title/artist로 분해" 정규화. 정규식 우선, LLM은 폴백.

---

## 4. 파이프라인 ② — 콜라보 탐지 (YouTube 메타데이터, 확정)

**결정: Twitter 사용 안 함**(유료 $200/월). 콜라보는 전적으로 **YouTube 메타데이터 기반**으로 탐지.

```
A. 후레아 채널 신규 업로드 스캔
   - 제목/설명에 콜라보 상대명/콜라보 키워드(コラボ, 凸待ち 등) → 콜라보 후보
B. 콜라보 채널 목록 스캔 (data/collab-channels.json)
   - 白銀ノエル(노에후레), 3기생 ファンタジー(페코라·마린·노엘), IRyS, 자주 엮이는 멤버들의 최근 업로드에서 "フレア"/"Flare" 멘션 → 게스트 출연 후보
   ▼
콜라보 후보 영상 → (아카이브면) ①댓글 파싱 파이프라인으로
   ▼
태그 자동부여: ["콜라보"] + 참여자 sing 채움 → 리뷰 큐
```
- `data/collab-channels.json`: 모니터링할 채널 ID 목록(수동 관리, 가끔 추가). 초기 후보: 白銀ノエル, 兎田ぺこら, 宝鐘マリン(3기생), IRyS, 자주 엮이는 멤버.
- 트위터 공지는 자동화에서 제외. 누락된 콜라보는 수동 입력으로 보완(리뷰 단계에서 추가).

---

## 5. 파이프라인 ③ — 신곡 자동 업데이트

```
업로드 재생목록 ID = 채널ID 앞 UC→UU 치환
   ▼
playlistItems.list(playlistId=UU..., order 최신)   # 1u, search(100u)보다 저렴
   ▼
last_seen 이후 신규 영상만
   ▼
오리지널곡 휴리스틱:
   - 제목: 【オリジナル曲】/【MV】/Music Video/「曲名」
   - 길이: 약 2~7분
   - 설명: Lyrics/作詞/作曲/Vocal 표기
   ▼
신곡 후보 → 리뷰 큐 (tags=["오리지널"], 앨범/크레딧 필드 비워둠 → 수동 보강)
```

---

## 6. 데이터 반영 — 리뷰 게이트 (방식 A: GitHub PR, 권장)

```
Cron Worker (수집/파싱)
   ▼  GitHub API (contents/PR)
data/_staging/ 또는 PR 브랜치에 후보 JSON 커밋
   ▼  사람이 PR 리뷰 (오인 구간 제거/제목 수정/태그 확정)
머지
   ▼  Cloudflare Pages 자동 재빌드 → 배포 ($0)
```
- 런타임은 끝까지 **정적**. 자동화는 빌드 입력(데이터)만 바꿈.
- 장점: 버전관리·diff 리뷰·롤백 용이, 비용 0, 잘못된 자동파싱이 바로 라이브로 안 감.

### 방식 B (대안): Cloudflare D1 staging
- 후보를 D1 테이블 `songs_staging(status: candidate|approved|rejected)`에 적재.
- 간단한 보호된 관리 페이지에서 승인 → `songs` 테이블/`songs.json` 반영.
- 즉시성↑이지만 관리 UI·인증 구현 필요. MVP엔 과함.

---

## 7. 상태/중복 관리

자동화엔 "어디까지 처리했나" 상태가 필요:

```jsonc
// state.json (KV 또는 repo)
{
  "channels": { "UCxxxx": { "lastSeenVideoId": "...", "lastSweepAt": "" } },
  "videos":   { "VIDEOID": { "actualEndTime": "", "status": "pending|parsed|skipped" } }
}
```
- 중복 방지 키: Song `id = videoId + "_" + start`. 이미 있으면 후보에서 제외.
- 멱등성: 같은 영상 재처리해도 동일 후보 → 중복 PR/행 생성 안 되게 id로 dedupe.

---

## 8. 모듈 구조 (Worker, 웹 표준 fetch 기반 — Node API 금지)

```
worker/
  index.ts            # scheduled() 핸들러: cron 분기
  jobs/
    sweepDaily.ts      # 신곡 + 콜라보 스캔
    parsePending.ts    # 종료+5h 방송 댓글 파싱
  youtube.ts           # YouTube REST를 fetch로 호출 (googleapis 라이브러리 X)
  parseSetlist.ts      # 댓글 → Song[] 파싱 (정규식)
  classify.ts          # 오리지널/콜라보 휴리스틱
  github.ts            # 후보 → PR/커밋 (GitHub REST)
  state.ts             # KV 상태 read/write
wrangler.toml          # crons + secrets(YOUTUBE_API_KEY, GITHUB_TOKEN)
```
> Cloudflare Workers는 Node 런타임이 아니므로 `googleapis` 대신 **YouTube Data REST API를 `fetch`로 직접** 호출.
> 시크릿은 `wrangler secret`(YOUTUBE_API_KEY, GITHUB_TOKEN) — 절대 커밋 금지.

---

## 9. 리스크 & 한계 (명시)

- **댓글 파싱 정확도**: 포맷 제각각 → 100% 자동 불가. 리뷰 필수. (핵심 가치 = 수작업 80% 절감)
- **세트리스트 댓글 부재**: 댓글에 타임스탬프 없으면 자동 스킵 → 수동 입력 대상으로 표시.
- **Twitter 미지원**: $0 목표상 제외. 콜라보는 YouTube 탐지로 커버(누락 가능 → 수동 보완).
- **YouTube 정책**: 댓글/메타 읽기는 API 약관 내. 영상은 임베드만. 멤버십 한정 다루지 않음(MVP).
- **분류 휴리스틱 오판**: 오리지널/콜라보 태그는 후보일 뿐, 확정은 사람이.

---

## 10. 단계적 도입 순서

1. 사이트 MVP(정적) 먼저 — `data/songs.json` 수동.
2. ③ 신곡 감시(가장 단순) → PR 리뷰 흐름 확립.
3. ① 댓글 타임스탬프 파싱 → 리뷰 큐.
4. ② 콜라보 탐지(YouTube 기반).
5. (선택) LLM 정규화, D1 staging, Twitter 유료 도입 검토.
