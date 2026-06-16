// 후레아 오리지널/콜라보/유닛 곡 수집 → src/data/songs.json (병합)
//
//   node scripts/ingest-originals.mjs [--scan 2000] [--handle ShiranuiFlare] [--dry]
//
// 오리지널 MV는 메인 채널에 "…/不知火フレア(official)" + 【original MV】 형식으로 올라온다.
// 단일 MV = 영상 전체가 한 곡(start=0, end=duration). 멀티 아티스트(＆/×/feat)면 콜라보/유닛.

import { resolveChannel, listUploads, videoDetails } from "./youtube.mjs";
import { mergeWrite, loadDevVars, isoDurationToSeconds } from "./store.mjs";

loadDevVars();

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const SCAN = parseInt(opt("scan", "2000"), 10);
const HANDLE = opt("handle", "ShiranuiFlare");
const OUT = opt("out", "src/data/songs.json");
const DRY = args.includes("--dry");

// 오리지널 MV 판별 마커
const ORIGINAL_RE = /\(official\)|original\s*(anime\s*)?mv|オリジナル(曲|mv)?|music\s*video|【\s*mv\s*】/i;
// 제외(MV가 아닌 것): 踊ってみた(댄스), 試聴, ティザー, teaser, short
const EXCLUDE_RE = /踊ってみた|振り付け|teaser|ティザー|試聴|cm|trailer|making|メイキング/i;
// 유닛/그룹 이름 (개인이 아닌 명명된 유닛)
const UNIT_RE = /フレアイリス|不知火建設|ユニット|\bunit\b/i;
// 후레아가 속한 알려진 듀오/유닛 페어 (아티스트 표기 → 유닛 판정)
const UNIT_PAIR_RE = /フレア\s*[＆&×]\s*irys|irys\s*[＆&×]\s*フレア/i;

const FLARE = "不知火フレア";

/** "【original MV】曲名/不知火フレア＆IRyS (official)" → {title, artist} */
function parseOriginalTitle(raw) {
  let s = (raw || "").trim();
  while (/^[\[【][^\]】]*[\]】]\s*/.test(s)) s = s.replace(/^[\[【][^\]】]*[\]】]\s*/, ""); // 선두 【...】 제거
  const idx = s.lastIndexOf("/");
  let title = idx > 0 ? s.slice(0, idx) : s;
  let artist = idx > 0 ? s.slice(idx + 1) : "";
  // 정리
  title = title.replace(/[\(（]\s*official.*$/i, "").replace(/[\(（]\s*$/, "").trim();
  artist = artist.replace(/[\(（]\s*official.*$/i, "").replace(/[\(（].*$/, "").trim();
  if (!artist) artist = FLARE;
  return { title, artist };
}

function classify(artist, rawTitle) {
  const tags = ["오리지널"];
  const artists = artist
    .split(/\s*[＆&×x✕,、・]\s*|\s+feat\.?\s+|\s+ft\.?\s+|\s+with\s+/i)
    .map((a) => a.trim())
    .filter(Boolean);
  const isMulti = artists.length > 1;
  if (isMulti) tags.push("콜라보");
  if (UNIT_RE.test(artist) || UNIT_RE.test(rawTitle) || UNIT_PAIR_RE.test(artist)) tags.push("유닛");
  return { tags, artists, isMulti };
}

async function main() {
  console.log(`▶ 채널 확인: @${HANDLE}`);
  const ch = await resolveChannel(HANDLE);
  console.log(`  ${ch.title}`);

  console.log(`▶ 업로드 스캔(최근 ${SCAN}) → 오리지널 MV 필터…`);
  const uploads = await listUploads(ch.uploadsPlaylistId, SCAN);
  const cands = uploads.filter(
    (u) => ORIGINAL_RE.test(u.title) && !EXCLUDE_RE.test(u.title),
  );
  console.log(`  후보 ${cands.length}개 (스캔 ${uploads.length})`);

  const details = await videoDetails(cands.map((c) => c.videoId));

  const songs = [];
  for (const c of cands) {
    const det = details.get(c.videoId);
    const dur = isoDurationToSeconds(det?.duration);
    // MV는 보통 1.5~8분. 너무 길면(아카이브/리레) 제외
    if (dur && (dur < 60 || dur > 600)) continue;
    const broadcastAt = det?.publishedAt || c.publishedAt;
    const { title, artist } = parseOriginalTitle(c.title);
    if (!title) continue;
    const { tags, artists } = classify(artist, c.title);
    songs.push({
      id: `${c.videoId}_0`,
      sourceOrder: 0,
      source: "original",
      title,
      artist,
      artists,
      hl: { ja: { title, artist, artists } },
      sing: artist,
      sings: artists,
      videoId: c.videoId,
      videoUri: `https://www.youtube.com/watch?v=${c.videoId}`,
      start: 0,
      end: dur || 0,
      broadcastAt,
      year: broadcastAt ? new Date(broadcastAt).getFullYear() : 0,
      tags,
      milestones: [],
    });
  }

  // id dedupe
  const byId = new Map();
  for (const s of songs) if (!byId.has(s.id)) byId.set(s.id, s);
  const list = [...byId.values()].sort((a, b) => new Date(b.broadcastAt) - new Date(a.broadcastAt));

  console.log(`\n── 오리지널 ${list.length}곡 ──`);
  for (const s of list) {
    console.log(`  ${s.broadcastAt.slice(0, 10)}  [${s.title}] / [${s.artist}]  {${s.tags.join(",")}}`);
  }

  if (DRY) {
    console.log("\n--dry: 파일 미기록");
    return;
  }
  // original 소스만 교체, 다른 소스(노래방송/시드)는 보존
  const r = mergeWrite(OUT, list, (s) => s.source === "original" || (!s.source && s.tags.includes("오리지널")));
  console.log(`\n✓ 저장: ${OUT}  (총 ${r.total}곡 · 오리지널 교체 ${r.replaced} · 타 소스 보존 ${r.kept})`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
