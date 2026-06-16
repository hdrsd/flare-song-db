export type Locale = "ja" | "ko";

export interface LocalizedFields {
  title: string;
  artist: string;
  artists: string[];
  album?: string;
  sing?: string;
  sings?: string[];
}

export interface Song {
  // 식별
  id: string; // = `${videoId}_${start}` (유니크). 라우팅/즐겨찾기 키
  sourceOrder: number;
  source?: string; // 수집 소스: "utawaku" | "original" | "seed" (병합 소유권 구분)

  // 표시(현재 로케일 반영) — 렌더 시 hl에서 채움
  title: string;
  artist: string;
  artists: string[];

  // 다국어 원문 (저장의 진실 소스)
  hl: {
    ja: LocalizedFields;
    ko?: LocalizedFields;
  };

  // 부른 사람
  sing: string;
  sings: string[];

  // 영상 + 재생 구간 (핵심)
  videoId: string;
  videoUri: string;
  start: number; // 초
  end: number; // 초 (0이면 영상 끝까지)
  broadcastAt: string; // ISO
  year: number;

  // 분류/검색
  tags: string[];
  titleAliases?: string[];
  artistAliases?: string[];
  milestones?: string[];

  // 앨범/오리지널곡 메타
  album?: string;
  albumReleaseAt?: string;
  albumListUri?: string;
  albumIsCompilation?: boolean;
  lyricist?: string;
  composer?: string;
  arranger?: string;
  albumArt?: string; // "/albums/xxx.webp" 또는 외부 URL. 없으면 YouTube 썸네일 폴백

  // 라이브/기타
  liveCall?: string;
  liveNote?: string;
  extra?: string;

  // 멤버십/통계 (선택)
  isMembersOnly?: boolean;
  viewCount?: number;
}
