// 수동 시드 곡(홀로 전체곡/유닛/콜라보 등 후레아 채널 밖 영상) → src/data/songs.json (병합)
//
//   node scripts/ingest-seed.mjs [--seed data/seed.songs.json] [--dry]
//
// 사람이 data/seed.songs.json 에 { videoId, title, artist, sing, tags, [start,end,broadcastAt] } 추가.
// 길이/공개일/제목 폴백은 YouTube API로 자동 보강. start/end 없으면 영상 전체(0~duration).

import { readFileSync } from "node:fs";
import { videoDetails } from "./youtube.mjs";
import { mergeWrite, loadDevVars, isoDurationToSeconds } from "./store.mjs";

loadDevVars();

const args = process.argv.slice(2);
const opt = (n, d) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};
const SEED = opt("seed", "data/seed.songs.json");
const OUT = opt("out", "src/data/songs.json");
const DRY = args.includes("--dry");

const splitNames = (v) =>
  (v || "")
    .split(/\s*[,、，/／＆&×]\s*|\s+feat\.?\s+|\s+with\s+/i)
    .map((x) => x.trim())
    .filter(Boolean);

function toIso(d) {
  if (!d) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return new Date(d + "T00:00:00Z").toISOString();
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? "" : t.toISOString();
}

async function main() {
  const seed = JSON.parse(readFileSync(SEED, "utf8"));
  if (!Array.isArray(seed) || seed.length === 0) {
    console.log("시드가 비어 있습니다:", SEED);
    return;
  }
  console.log(`▶ 시드 ${seed.length}개 — 영상 메타 보강…`);
  const details = await videoDetails(seed.map((e) => e.videoId));

  const songs = [];
  for (const e of seed) {
    const det = details.get(e.videoId);
    if (!det) {
      console.log(`  ✗ ${e.videoId}  영상을 찾을 수 없음 — 건너뜀`);
      continue;
    }
    const dur = isoDurationToSeconds(det.duration);
    const start = Number(e.start ?? 0);
    const end = Number(e.end ?? 0) || dur || 0;
    const title = e.title || det.title;
    const artist = e.artist || "";
    const artists = e.artists || splitNames(artist);
    const sing = e.sing || artist;
    const sings = splitNames(sing);
    const broadcastAt = toIso(e.broadcastAt) || det.publishedAt;
    const tags = Array.isArray(e.tags) ? e.tags : [];

    songs.push({
      id: `${e.videoId}_${start}`,
      sourceOrder: 0,
      source: "seed",
      title,
      artist,
      artists,
      hl: { ja: { title, artist, artists } },
      sing,
      sings,
      videoId: e.videoId,
      videoUri: `https://www.youtube.com/watch?v=${e.videoId}`,
      start,
      end,
      broadcastAt,
      year: broadcastAt ? new Date(broadcastAt).getFullYear() : 0,
      tags,
      milestones: [],
      ...(e.note ? { extra: e.note } : {}),
    });
  }

  console.log(`\n── 시드 ${songs.length}곡 ──`);
  for (const s of songs) {
    console.log(`  ${s.broadcastAt.slice(0, 10)}  [${s.title}] / [${s.artist}]  {${s.tags.join(",")}}`);
  }

  if (DRY) {
    console.log("\n--dry: 파일 미기록");
    return;
  }
  const r = mergeWrite(OUT, songs, (s) => s.source === "seed");
  console.log(`\n✓ 저장: ${OUT}  (총 ${r.total}곡 · 시드 교체 ${r.replaced} · 타 소스 보존 ${r.kept})`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
