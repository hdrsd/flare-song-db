// 세트리스트 댓글/설명 텍스트 → 곡 항목 파싱 (순수 함수, 키 불필요 · 테스트 가능)
// 예: "00:07:12 Song 01. セツナトリップ - Last Note. feat. GUMI (2012)"

const SEPARATORS = [" - ", " – ", " — ", " / ", "／", " ／ "];

/** "h:mm:ss" | "mm:ss" → 초 */
export function toSeconds(tc) {
  const p = tc.split(":").map((n) => parseInt(n, 10));
  if (p.some((n) => Number.isNaN(n))) return null;
  return p.length === 3 ? p[0] * 3600 + p[1] * 60 + p[2] : p[0] * 60 + p[1];
}

/** 한 줄에서 선두 타임코드 + 나머지 텍스트 추출 */
function parseLine(line) {
  const m = line.match(/^\s*[\[\(]?\s*((?:\d{1,2}:)?\d{1,2}:\d{2})\s*[\]\)]?\s*(.*)$/);
  if (!m) return null;
  const start = toSeconds(m[1]);
  if (start == null) return null;
  let rest = (m[2] || "").trim();
  // "Song 01." / "01." / "①" / "1)" 같은 번호 접두 제거
  rest = rest
    .replace(/^song\s*\d+\s*[.．:、]?\s*/i, "")
    .replace(/^[#No.]*\s*\d+\s*[.．:)、]\s*/i, "")
    .replace(/^[①-⑳]\s*/, "")
    .trim();
  return { start, rest };
}

/** 곡 텍스트 → {title, artist} */
function splitTitleArtist(text) {
  let t = text.trim();
  // 끝의 발매연도 (2012) 제거
  t = t.replace(/\s*[\(（]\s*(19|20)\d{2}\s*[\)）]\s*$/, "").trim();
  for (const sep of SEPARATORS) {
    const idx = t.indexOf(sep);
    if (idx > 0) {
      return {
        title: t.slice(0, idx).trim(),
        artist: t.slice(idx + sep.length).trim(),
      };
    }
  }
  return { title: t, artist: "" };
}

/**
 * 세트리스트 텍스트 전체를 파싱.
 * @returns {{start:number,title:string,artist:string}[]}  start 오름차순, 중복 start 제거
 */
export function parseSetlist(text) {
  if (!text) return [];
  const seen = new Set();
  const out = [];
  for (const raw of text.split(/\r?\n/)) {
    const p = parseLine(raw);
    if (!p) continue;
    const { title, artist } = splitTitleArtist(p.rest);
    if (!title || title.length < 1) continue;
    if (seen.has(p.start)) continue; // JP/EN 중복 등 → 첫 등장(보통 JP) 유지
    seen.add(p.start);
    out.push({ start: p.start, title, artist });
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

/** 곡 항목 수(타임코드 라인 수)로 댓글이 세트리스트인지 점수화 */
export function setlistScore(text) {
  const parsed = parseSetlist(text);
  let score = parsed.length;
  if (/set\s*list|setlist|セトリ|セットリスト|タイムスタンプ|timestamp|目次|歌った曲|song\s*list/i.test(text)) {
    score += 5;
  }
  return { score, count: parsed.length };
}
