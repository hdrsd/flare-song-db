// 로컬 재생 횟수 — localStorage (클라이언트 전용)

const KEY = "flare:playcounts:v1";

function read(): Record<string, number> {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || "{}");
    return o && typeof o === "object" ? o : {};
  } catch {
    return {};
  }
}

export function getCount(id: string): number {
  return read()[id] || 0;
}

/** 재생 횟수 +1, 새 값 반환 */
export function bumpCount(id: string): number {
  const o = read();
  o[id] = (o[id] || 0) + 1;
  localStorage.setItem(KEY, JSON.stringify(o));
  return o[id];
}
