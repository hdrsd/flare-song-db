// 후레아 노래방송(歌枠) 자동 수집 → src/data/songs.json
//
//   node scripts/ingest.mjs [--scan 600] [--max 12] [--handle ShiranuiFlare] [--out src/data/songs.json] [--dry]
//
// 동작: 업로드 스캔 → 歌枠 필터 → 댓글에서 세트리스트 파싱 → Song[] 생성 → 저장.
// 키: .dev.vars 의 YOUTUBE_API_KEY (커밋 금지). 자동 파싱은 후보이므로 결과를 꼭 검토할 것.

import { resolveChannel, listUploads, videoDetails, topComments } from "./youtube.mjs";
import { parseSetlist, setlistScore } from "./parseSetlist.mjs";
import { mergeWrite, loadDevVars } from "./store.mjs";

loadDevVars();

// ── 인자 ────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const SCAN = parseInt(opt("scan", "600"), 10); // 스캔할 최근 업로드 수
const MAX = parseInt(opt("max", "12"), 10); // 처리할 歌枠 수(최신순)
const HANDLE = opt("handle", "ShiranuiFlare");
const OUT = opt("out", "src/data/songs.json");
const DRY = args.includes("--dry");

const SING_DEFAULT = "不知火フレア";
const CONC = parseInt(opt("conc", "6"), 10); // 댓글 수집 동시성
// 노래방송 마커(데뷔 초기 표기까지 커버). 세트리스트 댓글이 있는 것만 최종 채택되므로 다소 넓혀도 안전.
const UTAWAKU_RE = /歌枠|うた枠|うたわく|歌雑|歌う雑談|カラオケ|karaoke|singing|sing\s*along/i;

/** 동시성 제한 map (입력 순서 보존) */
async function mapPool(items, conc, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(conc, items.length) }, worker));
  return out;
}

// 곡이 아닌 구간(잡담/시작/종료/告知 등) — 세트리스트에 섞여 들어오므로 제외
const NON_SONG_RE =
  /^(スタート|start|開始|待機|準備|テスト|test|位置調整|音(量|声)|自己紹介|ご?挨拶|雑談|フリートーク|トーク|MC|告知|お知らせ|コメント|募集|おわり|終わり|終了|end(ing)?|エンディング|エンド|アウトロ|outro|オープニング|opening|intro|イントロ|締め|お礼|エンドカード|まったり|ラスト$)/i;

const LEADING_EMOJI =
  /^[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/u;

function isNonSong(p) {
  const t = (p.title || "").trim();
  if (!t) return true;
  if (NON_SONG_RE.test(t)) return true;
  // 아티스트 없고 제목이 사실상 기호/한 글자 → 비곡
  if (!p.artist && t.replace(/[\s；;・,、.。!！?？〜~ー…\-—]/g, "").length <= 1) return true;
  // 아티스트 없고 이모지로 시작(커멘터의 MC 캡션 스타일) → 비곡
  if (!p.artist && LEADING_EMOJI.test(t)) return true;
  return false;
}

const pad = (n) => String(n).padStart(2, "0");
const hms = (s) => `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;

function buildSongs(video, broadcastAt, parsed) {
  const year = broadcastAt ? new Date(broadcastAt).getFullYear() : 0;
  // 종료시각은 비곡 구간까지 포함한 '다음 항목' 기준으로 먼저 계산(잡담 마커가 경계 역할)
  const withEnd = parsed.map((p, idx) => ({
    ...p,
    end: idx + 1 < parsed.length ? parsed[idx + 1].start : 0, // 마지막은 영상 끝까지
  }));
  // 세트리스트의 절반 이상이 "곡 - 아티스트" 형식이면, 아티스트 없는 라인은 잡담으로 간주
  const artistRatio = withEnd.length
    ? withEnd.filter((p) => p.artist).length / withEnd.length
    : 0;
  const requireArtist = artistRatio >= 0.3;
  return withEnd
    .filter((p) => !isNonSong(p) && (!requireArtist || p.artist))
    .map((p) => {
      const artists = p.artist ? [p.artist] : [];
      return {
        id: `${video.videoId}_${p.start}`,
        sourceOrder: 0,
        source: "utawaku",
        title: p.title,
        artist: p.artist,
        artists,
        hl: { ja: { title: p.title, artist: p.artist, artists } },
        sing: SING_DEFAULT,
        sings: [SING_DEFAULT],
        videoId: video.videoId,
        videoUri: `https://www.youtube.com/watch?v=${video.videoId}`,
        start: p.start,
        end: p.end,
        broadcastAt,
        year,
        tags: /アカペラ|あかぺら|ｱｶﾍﾟﾗ|acappella|a\s*cappella/i.test(`${p.title} ${p.artist}`) ? ["歌枠", "아카펠라"] : ["歌枠"],
        milestones: [],
      };
    });
}

async function main() {
  console.log(`▶ 채널 확인: @${HANDLE}`);
  const ch = await resolveChannel(HANDLE);
  console.log(`  ${ch.title} (${ch.channelId})`);

  console.log(`▶ 업로드 스캔 (최근 ${SCAN}개)…`);
  const uploads = await listUploads(ch.uploadsPlaylistId, SCAN);
  const streams = uploads.filter((u) => UTAWAKU_RE.test(u.title)).slice(0, MAX);
  console.log(`  歌枠 후보 ${streams.length}개 (스캔 ${uploads.length})`);

  if (streams.length === 0) {
    console.log("처리할 歌枠가 없습니다. --scan 을 늘려보세요.");
    return;
  }

  const details = await videoDetails(streams.map((s) => s.videoId));

  let done = 0;
  async function processStream(st) {
    const det = details.get(st.videoId);
    const broadcastAt = det?.actualStartTime || det?.publishedAt || st.publishedAt;
    const comments = await topComments(st.videoId, 100);

    // 세트리스트 댓글 선별
    let best = null;
    for (const c of comments) {
      const sc = setlistScore(c.text);
      if (sc.count >= 3 && (!best || sc.score > best.score)) best = { ...sc, text: c.text };
    }
    done++;
    if (!best) {
      return { songs: [], line: `  ✗ ${st.videoId}  세트리스트 없음 — ${st.title.slice(0, 34)}` };
    }
    const parsed = parseSetlist(best.text);
    const songs = buildSongs(st, broadcastAt, parsed);
    if (done % 10 === 0) console.log(`  …진행 ${done}/${streams.length}`);
    return {
      songs,
      line: `  ✓ ${st.videoId}  ${String(songs.length).padStart(2)}곡  (${broadcastAt.slice(0, 10)}) — ${st.title.slice(0, 32)}`,
    };
  }

  const results = await mapPool(streams, CONC, processStream);
  const allSongs = [];
  const report = [];
  for (const r of results) {
    allSongs.push(...r.songs);
    report.push(r.line);
  }

  console.log("\n── 처리 결과 ──");
  report.forEach((r) => console.log(r));
  console.log(`\n수집 ${allSongs.length}곡 / ${streams.length}개 방송`);

  if (allSongs[0]) {
    const s = allSongs[0];
    console.log(`예시: ${hms(s.start)}–${s.end ? hms(s.end) : "끝"}  [${s.title}] / [${s.artist}]  ${s.videoUri}&t=${s.start}s`);
  }

  if (DRY) {
    console.log("\n--dry: 파일 미기록");
    return;
  }
  // utawaku 소스만 교체, 다른 소스는 보존
  const r = mergeWrite(OUT, allSongs, (s) => s.source === "utawaku" || (!s.source && s.tags.includes("歌枠")));
  console.log(`\n✓ 저장: ${OUT}  (총 ${r.total}곡 · 노래방송 교체 ${r.replaced} · 타 소스 보존 ${r.kept})`);
}

main().catch((e) => {
  console.error("ERROR:", e.message);
  process.exit(1);
});
