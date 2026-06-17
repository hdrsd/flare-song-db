// 따로 올린 커버 MV/싱글 수집 → src/data/songs.json (병합, 우타와꾸와 분리)
//
//   node scripts/ingest-covers.mjs [--scan 2000] [--dry]
//
// 노래방송(歌枠)이 아닌 '단독 커버 영상'(Cover/歌ってみた/カバー)을 수집.
// source="cover", tags=["커버"](歌枠 없음) → 디스코그래피 커버 탭에 분리 표시.
// 단일 영상 = 한 곡(start 0 ~ duration). 자동 파싱은 후보이므로 --dry 검토 권장.

import { resolveChannel, listUploads, videoDetails } from "./youtube.mjs";
import { mergeWrite, loadDevVars, isoDurationToSeconds } from "./store.mjs";

loadDevVars();

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(`--${n}`); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const SCAN = parseInt(opt("scan", "2000"), 10);
const HANDLE = opt("handle", "ShiranuiFlare");
const OUT = opt("out", "src/data/songs.json");
const DRY = args.includes("--dry");

const COVER_RE = /\bcover\b|歌ってみた|カバー|covered/i;
const EXCLUDE_RE = /歌枠|踊ってみた|mmd|teaser|ティザー|試聴|メイキング|making|trailer|3d\s*live|宣伝|cm/i;
const UNIT_RE = /フレアイリス|不知火建設|ノエフレ/i;
const FLARE = "不知火フレア";

function strip(x) {
  return (x || "")
    .replace(/【[^】]*】/g, "")
    .replace(/[\(（]\s*cover.*$/i, "")
    .replace(/covered\s*by.*$/i, "")
    .replace(/[\(（]\s*official.*$/i, "")
    .replace(/[\(（]\s*$/, "")
    .trim();
}

/** 커버 영상 제목 → {title, artist, sing} (베스트 에포트) */
function parseCover(raw) {
  let s = (raw || "").trim();
  let artist = "", title = "", sing = "";
  const m = s.match(/^(.*?)[「『](.+?)[」』](.*)$/); // 아티스트「곡명」가수
  if (m) { artist = m[1]; title = m[2]; sing = m[3]; }
  else {
    s = s.replace(/^[\[【][^\]】]*[\]】]\s*/, "");
    const i = s.lastIndexOf("/");
    if (i > 0) { title = s.slice(0, i); sing = s.slice(i + 1); } else title = s;
  }
  title = strip(title); artist = strip(artist); sing = strip(sing);
  if (!sing) sing = FLARE;
  return { title, artist, sing };
}

const splitNames = (v) => (v || "").split(/\s*[,、，/／＆&×✕]\s*|\s+feat\.?\s+|\s+with\s+/i).map((x) => x.trim()).filter(Boolean);

async function main() {
  const ch = await resolveChannel(HANDLE);
  console.log(`▶ ${ch.title} — 업로드 스캔(${SCAN}) → 단독 커버 필터`);
  const uploads = await listUploads(ch.uploadsPlaylistId, SCAN);
  const cands = uploads.filter((u) => COVER_RE.test(u.title) && !EXCLUDE_RE.test(u.title));
  console.log(`  후보 ${cands.length}개`);
  const details = await videoDetails(cands.map((c) => c.videoId));

  const songs = [];
  for (const c of cands) {
    const det = details.get(c.videoId);
    const dur = isoDurationToSeconds(det?.duration);
    if (dur && (dur < 60 || dur > 600)) continue; // MV 길이대만
    const { title, artist, sing } = parseCover(c.title);
    if (!title) continue;
    const sings = splitNames(sing);
    const tags = ["커버"];
    if (sings.length > 1) tags.push("콜라보");
    if (UNIT_RE.test(c.title) || UNIT_RE.test(sing)) tags.push("유닛");
    const broadcastAt = det?.publishedAt || c.publishedAt;
    songs.push({
      id: `${c.videoId}_0`, sourceOrder: 0, source: "cover",
      title, artist, artists: artist ? splitNames(artist) : [],
      hl: { ja: { title, artist, artists: artist ? splitNames(artist) : [] } },
      sing, sings,
      videoId: c.videoId, videoUri: `https://www.youtube.com/watch?v=${c.videoId}`,
      start: 0, end: dur || 0, broadcastAt,
      year: broadcastAt ? new Date(broadcastAt).getFullYear() : 0,
      tags, milestones: [],
    });
  }
  const byId = new Map(); for (const s of songs) if (!byId.has(s.id)) byId.set(s.id, s);
  const list = [...byId.values()].sort((a, b) => new Date(b.broadcastAt) - new Date(a.broadcastAt));

  console.log(`\n── 단독 커버 ${list.length}곡 ──`);
  for (const s of list) console.log(`  ${s.broadcastAt.slice(0, 10)}  [${s.title}] / 가수:${s.sing}  {${s.tags.join(",")}}`);

  if (DRY) { console.log("\n--dry: 파일 미기록"); return; }
  const r = mergeWrite(OUT, list, (s) => s.source === "cover");
  console.log(`\n✓ 저장: ${OUT}  (총 ${r.total}곡 · 커버 교체 ${r.replaced} · 타 소스 보존 ${r.kept})`);
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
