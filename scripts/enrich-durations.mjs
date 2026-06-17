// 우타와꾸 곡의 end를 "시작 + 곡길이 + 2초"로 캡 (다음 곡 시작은 안 넘김).
// 곡 길이는 Deezer API(무키)로 조회, data/song-durations.json 에 캐시.
//
//   node scripts/enrich-durations.mjs [--dry]
//
// 곡이 끝난 뒤 다음 타임스탬프까지 잡담이 재생되던 문제 해결.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const SONGS = "src/data/songs.json";
const CACHE = "data/song-durations.json";
const DRY = process.argv.includes("--dry");
const CONC = 5;
const PAD = 2; // +2초
const MIN_DUR = 60, MAX_DUR = 420; // 비정상 매칭 방어(곡 길이 범위)

const songs = JSON.parse(readFileSync(SONGS, "utf8"));
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};

const isUtawaku = (s) => s.tags?.includes("歌枠");
const keyOf = (s) => `${s.hl?.ja?.title || s.title}|${s.hl?.ja?.artist || s.artist}`;

function mainArtist(a) {
  return (a || "").split(/feat\.?|ft\.?|／|\/|,|、|＆|&|×|✕/i)[0].replace(/[（(].*$/, "").trim();
}

// 길이가 원곡과 다른 버전만 제외(오르골/리믹스/나이트코어/배속 등).
// 카라오케/커버 채널은 길이가 거의 같아 허용(길이 추정용).
const KARAOKE = /オルゴール|music\s*box|nightcore|sped\s*up|slowed|reverb|remix|リミックス|8-?bit|chiptune|tiktok|loop|extended/i;
const norm = (s) => (s || "").toLowerCase().replace(/[\s\-・,，、.。!！?？'"`～~’]/g, "");

async function queryDeezer(qstr, am) {
  try {
    const r = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(qstr)}&limit=10`);
    if (!r.ok) return null;
    const d = await r.json();
    const list = (d.data || []).filter(
      (t) => t.duration >= MIN_DUR && t.duration <= MAX_DUR &&
        !KARAOKE.test(t.artist?.name || "") && !KARAOKE.test(t.title || ""),
    );
    if (!list.length) return null;
    const matched = am && list.find((t) => { const an = norm(t.artist?.name); return an && (an.includes(am) || am.includes(an)); });
    return Number((matched || list[0]).duration);
  } catch {
    return null;
  }
}

async function deezerDuration(title, artist) {
  const a = mainArtist(artist);
  const am = norm(a);
  // 제목+아티스트 → 실패 시 제목만
  return (a ? await queryDeezer(`${title} ${a}`, am) : null) ?? (await queryDeezer(title, am));
}

async function mapPool(items, conc, fn) {
  let i = 0;
  async function worker() { while (i < items.length) { const idx = i++; await fn(items[idx], idx); } }
  await Promise.all(Array.from({ length: Math.min(conc, items.length) }, worker));
}

async function main() {
  // 캐시에 없는 고유 곡 수집
  const uniq = new Map(); // key → {title, artist}
  for (const s of songs) {
    if (!isUtawaku(s)) continue;
    const k = keyOf(s);
    if (!(k in cache) && !uniq.has(k)) uniq.set(k, { title: s.hl?.ja?.title || s.title, artist: s.hl?.ja?.artist || s.artist });
  }
  const todo = [...uniq.entries()];
  console.log(`▶ 곡 길이 조회 — 고유 미캐시 ${todo.length}곡 (캐시 ${Object.keys(cache).length})`);

  let done = 0, found = 0;
  await mapPool(todo, CONC, async ([k, v]) => {
    const dur = await deezerDuration(v.title, v.artist);
    cache[k] = dur && dur >= MIN_DUR && dur <= MAX_DUR ? dur : 0; // 0 = 못 찾음/비정상
    if (cache[k]) found++;
    if (++done % 100 === 0) console.log(`  …${done}/${todo.length} (적중 ${found})`);
  });
  writeFileSync(CACHE, JSON.stringify(cache, null, 0) + "\n", "utf8"); // 캐시는 항상 저장
  console.log(`  조회 완료: 적중 ${found}/${todo.length}`);

  // 적용: 우타와꾸 중간곡(end>start)의 end 캡
  const OUTLIER = 420; // 매칭 안 된 곡 중 구간 7분 초과 → 안전 캡
  const OUTLIER_CAP = 360;
  let capped = 0, outlier = 0, savedTotal = 0;
  for (const s of songs) {
    if (!isUtawaku(s) || !(s.end > s.start)) continue;
    const dur = cache[keyOf(s)];
    const gap = s.end - s.start;
    let newEnd = s.end;
    let kind = "";
    // 곡 길이가 구간의 50% 이상일 때만 캡(잘못된 짧은 매칭으로 과도 절단 방지)
    if (dur && dur >= gap * 0.5) { newEnd = Math.min(s.end, s.start + dur + PAD); kind = "len"; }
    else if (gap > OUTLIER) { newEnd = s.start + OUTLIER_CAP; kind = "out"; } // 7분 초과 안전 캡
    if (newEnd < s.end) {
      savedTotal += s.end - newEnd; s.end = newEnd;
      if (kind === "len") capped++; else outlier++;
    }
  }
  const avg = capped ? Math.round(savedTotal / (capped + outlier)) : 0;
  console.log(`▶ 캡 적용: 곡길이 ${capped}곡 + 아웃라이어 ${outlier}곡 · 평균 ${avg}초 단축 (총 ${Math.round(savedTotal / 60)}분)`);

  if (DRY) { console.log("--dry: songs.json 미기록"); return; }
  writeFileSync(SONGS, JSON.stringify(songs, null, 2) + "\n", "utf8");
  console.log(`✓ 저장: ${SONGS}`);
}

main().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
