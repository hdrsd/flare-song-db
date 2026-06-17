// 아카펠라 곡들의 깨진 제목/아티스트 복원. --dry 로 미리보기.
import { readFileSync, writeFileSync } from "node:fs";

const DRY = process.argv.includes("--dry");
const P = "src/data/songs.json";
const songs = JSON.parse(readFileSync(P, "utf8"));

const stripQuotes = (x) => (x || "").replace(/^[『「“"”\s]+/, "").replace(/[』」“"”\s]+$/, "").trim();

function fix(t0, a0) {
  let t = (t0 || "").trim();
  let a = (a0 || "").trim();
  let nt = t, na = a;

  if (t === "(アカペラ") {
    // 패턴 A: 제목이 "(アカペラ", 실제 곡명은 아티스트에 ")" 붙어있음
    nt = a.replace(/[)\）]\s*$/, "").trim();
    na = "";
  } else if (/^アカペラ\s*[(（]/.test(t)) {
    // 패턴 B: "アカペラ (곡명", 아티스트="아티스트)"
    nt = t.replace(/^アカペラ\s*[(（]/, "").trim();
    na = a.replace(/[)\）]\s*$/, "").trim();
  } else if (/[(（]\s*アカペラ\s*[)）]\s*$/.test(t)) {
    // 패턴 E: "곡명(アカペラ)"
    nt = t.replace(/[(（]\s*アカペラ\s*[)）]\s*$/, "").trim();
  } else if (/のアカペラ/.test(t)) {
    // 패턴 D: "…"곡명"のアカペラ" → 따옴표 안 곡명. 없으면(예: フレアのアカペラ) 원본 유지
    const q = t.match(/[「『"“”](.+?)[」』"“”]/);
    nt = q ? q[1].trim() : t;
  }
  nt = stripQuotes(nt);
  return { t: nt || t, a: na };
}

let changed = 0;
for (const s of songs) {
  if (!s.tags.includes("아카펠라")) continue;
  const ja = s.hl?.ja || {};
  const { t, a } = fix(ja.title, ja.artist);
  if (t === ja.title && a === (ja.artist || "")) continue;
  const before = `[${ja.title}] / [${ja.artist}]`;
  // 적용: hl.ja + 표시 필드
  ja.title = t; ja.artist = a;
  ja.artists = a ? [a] : [];
  s.title = t; s.artist = a; s.artists = a ? [a] : [];
  changed++;
  console.log(`${before}\n  → [${t}] / [${a}]`);
}
console.log(`\n복원: ${changed}곡`);
if (!DRY) { writeFileSync(P, JSON.stringify(songs, null, 2) + "\n", "utf8"); console.log("✓ 저장"); }
else console.log("--dry: 미저장");
