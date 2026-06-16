# 데이터 모델 — 후레아 노래 DB

> 참조본의 `Song` 타입을 후레아용 + **로컬 JSON 저장** + **ja/ko 다국어**로 재설계.
> 원본은 시트→런타임 변환이었지만, 우리는 **가공 완료된 JSON을 그대로 저장**한다.

---

## 1. 참조본 Song 타입 (원본 그대로)

```ts
export interface Song {
  slug?: string;            // 제목 기반 슬러그
  slugv2?: string;          // video_id + start초 → 유니크 슬러그 (중복 곡 구분)
  source_order?: number;    // 원본 행 순서
  title: string;            // (로케일 반영된) 제목
  title_en?: string;
  title_aliases?: string[]; // 검색 별칭
  artist: string;           // 아티스트(원곡자)
  artist_en?: string;
  artists?: string[];       // 콤마 분리 배열
  sing: string;             // 부른 사람 (예: "AZKi, Polka")
  sings: string[];
  hl: {                     // 로케일별 원문 보존 (highlight/번역용)
    ja: { title; artist; artists; album?; sing?; sings? };
    en?: { ... };
  };
  album: string;
  album_release_at: string; // ISO
  album_is_compilation: boolean;
  album_list_uri: string;   // YouTube 재생목록 URL
  album_id?: string;
  lyricist: string; composer: string; arranger: string;
  video_title: string;
  video_uri: string;        // YouTube URL
  video_id: string;         // 11자 ID
  is_members_only?: boolean;
  start: number;            // 곡 시작 (초)
  end: number;              // 곡 종료 (초)
  broadcast_at: string;     // 방송일 ISO
  year: number;
  tags: string[];
  milestones: string[];     // 마일스톤 (예: "Debut MV", "100万再生")
  extra?: string;           // 비고
  live_call?: string;       // 라이브 콜(콜&리스폰스) 안내
  live_note?: string;
  view_count?: number;
}
```

**필드의 의미 핵심**: 한 곡 = `video_id` + `start`~`end` 구간 + 메타. 같은 영상에서 여러 곡이 나오면
`video_id`는 같고 `start`만 다른 여러 Song 레코드가 된다. 그래서 유니크 키 `slugv2 = slug(video_id + "_" + start)`.

---

## 2. 후레아용 Song 스키마 (ja/ko, 권장)

다국어를 `hl.ja` / `hl.ko` 로 보존하고, 화면용 `title`/`artist`는 선택 로케일로 채운다.

```ts
export interface Song {
  // 식별
  id: string;              // = `${videoId}_${start}` (유니크). 라우팅/즐겨찾기 키
  sourceOrder: number;     // 입력 순서

  // 표시(현재 로케일 반영) — 렌더 시 hl에서 채움
  title: string;
  artist: string;          // 원곡 아티스트
  artists: string[];

  // 다국어 원문 (저장의 진실 소스)
  hl: {
    ja: LocalizedFields;   // 일본어 (기본/필수)
    ko?: LocalizedFields;  // 한국어 (있으면 우선)
  };

  // 부른 사람 (후레아 단독이면 ["불명/후레아"], 콜라보면 여러 명)
  sing: string;            // "不知火フレア, 尾丸ポルカ"
  sings: string[];

  // 영상 + 재생 구간 (★ 핵심)
  videoId: string;         // YouTube 11자
  videoUri: string;        // https://youtu.be/...
  start: number;           // 초
  end: number;             // 초 (0/누락이면 영상 끝까지)
  broadcastAt: string;     // ISO 날짜 (방송/공개일)
  year: number;

  // 분류/검색
  tags: string[];          // ["커버", "유닛", ...] (분류 규칙의 근거)
  titleAliases?: string[]; // 검색 별칭
  artistAliases?: string[];
  milestones?: string[];

  // 앨범/오리지널곡 메타 (해당될 때만)
  album?: string;
  albumReleaseAt?: string;
  albumListUri?: string;   // 재생목록 URL
  albumIsCompilation?: boolean;
  lyricist?: string; composer?: string; arranger?: string;

  // 라이브/기타
  liveCall?: string;
  liveNote?: string;
  extra?: string;

  // 멤버십/통계 (선택)
  isMembersOnly?: boolean;
  viewCount?: number;
}

interface LocalizedFields {
  title: string;
  artist: string;
  artists: string[];
  album?: string;
  sing?: string;
  sings?: string[];
}
```

> 원본 대비 변경점: `slug/slugv2` → 단일 `id`로 단순화, `en` → `ko` 추가, camelCase 통일,
> 빌드타임 가공 전제이므로 `source_order` 등 그대로 유지.

---

## 3. 저장 형식 (로컬 JSON)

### 권장 A — 단일 파일 + 다국어 인라인
```
data/
  songs.json        # Song[] (hl.ja + hl.ko 인라인)
  meta.json         # 채널/마일스톤/기념일/이벤트
```
장점: 가장 단순. 곡 수천 개여도 한 파일 fetch면 충분(수백 KB~수 MB).

### 권장 B — 시트/CSV로 편집 → 빌드 스크립트로 변환
비개발자 편집을 원하면 원본처럼 표로 입력하되, **빌드타임에 JSON으로 변환**:
```
data/
  songs.csv         # 사람이 편집 (헤더는 4장 참조)
scripts/
  build-songs.ts    # CSV → songs.json (날짜 파싱, id 생성, 태그 split)
```
→ 원본의 `/api/songs` 런타임 변환 로직을 **빌드 스크립트로 이동**한 형태. 런타임에 시트/서버 불필요.

### songs.json 예시 (한 곡)
```json
{
  "id": "aA1WjJfRQ3Q_125",
  "sourceOrder": 0,
  "title": "사랑은 전쟁",
  "artist": "supercell",
  "artists": ["supercell"],
  "hl": {
    "ja": { "title": "恋は戦争", "artist": "supercell", "artists": ["supercell"] },
    "ko": { "title": "사랑은 전쟁", "artist": "supercell", "artists": ["supercell"] }
  },
  "sing": "不知火フレア",
  "sings": ["不知火フレア"],
  "videoId": "aA1WjJfRQ3Q",
  "videoUri": "https://youtu.be/aA1WjJfRQ3Q",
  "start": 125,
  "end": 380,
  "broadcastAt": "2024-03-01T00:00:00.000Z",
  "year": 2024,
  "tags": ["커버", "歌枠"],
  "milestones": []
}
```

---

## 4. 입력용 표(CSV/시트) 컬럼 — 편집자용

참조본 시트 구조를 후레아용으로 단순화:

| 컬럼 | 필수 | 설명 |
|------|------|------|
| `enabled` | ✓ | FALSE면 빌드 시 제외(임시 숨김) |
| `title_ja` | ✓ | 일본어 제목 |
| `title_ko` |  | 한국어 제목(있으면 우선 표시) |
| `artist` | ✓ | 원곡 아티스트 |
| `sing` |  | 부른 사람(콤마 구분). 비우면 후레아 단독 |
| `video` | ✓ | YouTube URL (또는 `=HYPERLINK(...)`) |
| `start` | ✓ | 시작 시각 `h:mm:ss` 또는 초 |
| `end` |  | 종료 시각 (비우면 영상 끝) |
| `broadcast_at` | ✓ | 방송/공개일 `YYYY-MM-DD` |
| `tags` |  | 콤마 구분 (`커버,歌枠`) |
| `milestones` |  | 콤마 구분 |
| `album` ~ `arranger` |  | 오리지널곡일 때만 |
| `live_call`,`live_note`,`extra` |  | 라이브/비고 |

빌드 스크립트가 할 일: `id = videoId + "_" + start초`, 날짜→ISO, `tags`/`sings` split, `year` 추출, `enabled=FALSE` 제거.

---

## 5. 분류 규칙 (후레아 태그 → 카테고리)

참조본 `config/filters` 를 후레아 태그로 재정의(예시):

```ts
const isOriginal      = (s) => s.tags.includes("오리지널");
const isCover         = (s) => s.tags.includes("커버");
const isCollaboration = (s) => s.tags.includes("유닛") || s.tags.includes("게스트")
                            || (s.tags.includes("홀로전체곡") && s.sing.includes("フレア"));
const isUtawaku       = (s) => s.tags.includes("歌枠"); // 노래방송에서 부른 곡
```
→ 디스코그래피 라우트: `/discography/originals`, `/covers`, `/collaborations`, `/albums`.
→ 태그 체계는 **처음에 합의해서 일관되게** 입력하는 게 가장 중요(런타임 분류가 전부 여기에 의존).

---

## 5.5. 이미지 (썸네일 / 앨범아트) — 비용 $0

이미지는 **외부 CDN 직접 링크**가 기본 → Cloudflare 대역폭·YouTube quota 거의 0.

### YouTube 썸네일 — 저장하지 말고 videoId로 조립
```ts
// API 호출 불필요. URL만 조립. (Google CDN이 서빙)
const thumb = (videoId: string, q = "hqdefault") =>
  `https://i.ytimg.com/vi/${videoId}/${q}.jpg`;
// 품질: maxresdefault(1280) → sddefault(640) → hqdefault(480, 항상 존재) → mqdefault(320)
```
- ⚠️ `maxresdefault`는 **없을 수 있음** → `<img onError>`로 maxres→sd→hq **폴백** 처리.
- 따라서 Song에 `thumbnailUrl` 같은 필드를 저장하지 않고 `videoId`에서 런타임 파생.

### 앨범아트 — 소수라 셀프호스팅 권장
```ts
interface Song {
  // ...
  albumArt?: string;   // "/albums/dawn.webp"(셀프호스팅) 또는 외부 URL. 없으면 MV 썸네일 폴백
}
```
- 오리지널곡은 수십 개 수준 → `/public/albums/*.webp`에 직접 두면 화질·가용성 보장(Pages 정적, 무료).
- 또는 Spotify Web API(무료)로 커버 URL 취득해 저장(이미지는 i.scdn.co CDN 서빙).
- `albumArt`가 비면 → 앨범 재생목록/MV의 YouTube 썸네일로 폴백.

---

## 6. 부가 데이터 (meta.json, 선택)

참조본의 milestones/anniversaries/events/channels 시트에 해당:

```json
{
  "channel": { "name": "不知火フレア", "youtube": "https://youtube.com/@ShiranuiFlare", "x": "https://x.com/shiranui_flare" },
  "anniversaries": [{ "date": "08-08", "name": "데뷔 N주년", "url": "" }],
  "events": [{ "start_at": "", "end_at": "", "content": "", "place": "", "url": "" }],
  "milestones": [{ "name": "채널 100만", "achievedAt": "" }]
}
```
필요해질 때 채우면 되고, MVP에서는 생략 가능.
