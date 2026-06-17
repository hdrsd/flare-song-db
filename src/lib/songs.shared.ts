// 클라이언트/서버 공용 순수 모듈 — songs.json 을 import 하지 않는다(번들 경량 유지).
// compact 인덱스(CompactSong)만 다룬다. /songs·/search·/watch 클라이언트가 공유.

export interface CompactSong {
  id: string;
  t: string; // title
  a: string; // artist
  s: string; // sing (부른 사람)
  g: string[]; // tags
  y: number; // year
  v: string; // videoId
  st: number; // start(초)
  e: number; // end(초)
  d: string; // broadcastAt (YYYY-MM-DD)
}

export function thumbUrl(videoId: string, q = "mqdefault"): string {
  return `https://i.ytimg.com/vi/${videoId}/${q}.jpg`;
}

export function fmtTime(sec: number): string {
  if (!sec || sec < 0) return "0:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return (h > 0 ? `${h}:` : "") + `${mm}:${String(s).padStart(2, "0")}`;
}

export function fmtDate(iso: string): string {
  return (iso || "").slice(0, 10);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

// ── 태그 로케일 라벨 (데이터의 태그는 canonical key, 표시만 로케일별) ──
const TAG_LABELS: Record<string, { ja: string; ko: string }> = {
  "歌枠": { ja: "歌枠", ko: "우타와꾸" },
  "커버": { ja: "カバー", ko: "커버" },
  "오리지널": { ja: "オリジナル", ko: "오리지널" },
  "콜라보": { ja: "コラボ", ko: "콜라보" },
  "유닛": { ja: "ユニット", ko: "유닛" },
  "홀로전체곡": { ja: "ホロライブ全体曲", ko: "홀로 전체곡" },
};

export function tagLabel(tag: string, locale: "ja" | "ko"): string {
  return TAG_LABELS[tag]?.[locale] ?? tag;
}

// ── 검색 (필드 접두사: title: artist: sing: tag: year: milestone: · 제외 -) ──
const FIELDS = ["title", "artist", "sing", "tag", "year", "milestone"] as const;
type Field = (typeof FIELDS)[number];

export interface Term {
  field?: Field;
  value: string;
  exclude: boolean;
}

export function parseQuery(q: string): Term[] {
  return q
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => {
      const exclude = tok.startsWith("-");
      const body = exclude ? tok.slice(1) : tok;
      const m = body.match(/^([a-z]+):(.+)$/i);
      if (m && (FIELDS as readonly string[]).includes(m[1].toLowerCase())) {
        return { field: m[1].toLowerCase() as Field, value: m[2], exclude };
      }
      return { value: body, exclude };
    });
}

function haystacks(s: CompactSong): Record<Field, string[]> {
  return {
    title: [s.t],
    artist: [s.a],
    sing: [s.s],
    tag: s.g,
    year: [String(s.y)],
    milestone: [],
  };
}

function termMatches(song: CompactSong, term: Term): boolean {
  const v = term.value.toLowerCase();
  const h = haystacks(song);
  if (term.field) return h[term.field].some((x) => x.toLowerCase().includes(v));
  return Object.values(h)
    .flat()
    .some((x) => x.toLowerCase().includes(v));
}

export function searchCompact(songs: CompactSong[], query: string): CompactSong[] {
  const terms = parseQuery(query);
  if (terms.length === 0) return songs;
  return songs.filter((song) =>
    terms.every((t) => (t.exclude ? !termMatches(song, t) : termMatches(song, t))),
  );
}

// ── 카드 HTML (SongCard.astro 와 동일 마크업) ──
export function renderCard(s: CompactSong, watchBase: string, searchBase: string, locale: "ja" | "ko" = "ja"): string {
  const dur = s.e > s.st ? `<span class="ts">${fmtTime(s.e - s.st)}</span>` : "";
  const watch = `${watchBase}?id=${encodeURIComponent(s.id)}`;
  const tags = s.g
    .slice(0, 3)
    .map(
      (tag) =>
        `<a class="badge tag" href="${searchBase}?q=tag:${encodeURIComponent(tag)}">${escapeHtml(tagLabel(tag, locale))}</a>`,
    )
    .join("");
  return `<article class="card">
    <a class="thumb" href="${watch}">
      <img src="${thumbUrl(s.v, "mqdefault")}" alt="${escapeHtml(s.t)}" loading="lazy"
        onerror="this.onerror=null;this.src='https://i.ytimg.com/vi/${s.v}/hqdefault.jpg'" />
      ${dur}
      <div class="thumb-title">${escapeHtml(s.t)}</div>
    </a>
    <div class="body">
      <p class="a">${escapeHtml(s.a)}</p>
      <div class="meta"><span class="badge date">${fmtDate(s.d)}</span>${tags}</div>
    </div>
  </article>`;
}
