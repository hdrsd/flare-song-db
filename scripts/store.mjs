// songs.json 공용 저장/병합 — 소스(노래방송/오리지널 등)별로 독립 갱신.
// 각 수집기는 자기 소스가 "소유"하는 곡만 교체하고, 다른 소스 곡은 보존한다.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

export function loadSongs(path) {
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return [];
  }
}

/**
 * 기존 곡 중 owns(s)=true(이 소스 소유)인 것을 제거하고 fresh로 교체.
 * 다른 소스 곡은 그대로 보존. id 기준 dedupe(먼저 온 것 우선) 후 정렬·기록.
 */
export function mergeWrite(path, fresh, owns) {
  const existing = loadSongs(path);
  const kept = existing.filter((s) => !owns(s)); // 다른 소스 곡 보존
  const combined = [...fresh, ...kept];

  const byId = new Map();
  for (const s of combined) if (!byId.has(s.id)) byId.set(s.id, s);

  const merged = [...byId.values()].sort((a, b) => {
    const t = new Date(b.broadcastAt).getTime() - new Date(a.broadcastAt).getTime();
    return t !== 0 ? t : a.start - b.start;
  });
  merged.forEach((s, i) => (s.sourceOrder = i));

  writeFileSync(path, JSON.stringify(merged, null, 2) + "\n", "utf8");
  return { total: merged.length, replaced: existing.length - kept.length, kept: kept.length };
}

/** .dev.vars 간이 로더 */
export function loadDevVars() {
  if (process.env.YOUTUBE_API_KEY || !existsSync(".dev.vars")) return;
  for (const line of readFileSync(".dev.vars", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m) process.env[m[1]] = m[2];
  }
}

/** ISO8601 duration(PT3M13S) → 초 */
export function isoDurationToSeconds(iso) {
  const m = (iso || "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return 0;
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
}
