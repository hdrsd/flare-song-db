// 즐겨찾기 — localStorage (클라이언트 전용)

const KEY = "flare:favorites:v1";

export function loadFavorites(): string[] {
  try {
    const arr = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function save(ids: string[]): void {
  localStorage.setItem(KEY, JSON.stringify(ids));
}

export function isFavorite(id: string): boolean {
  return loadFavorites().includes(id);
}

/** 토글 후 새 상태 반환 */
export function toggleFavorite(id: string): boolean {
  const ids = loadFavorites();
  const i = ids.indexOf(id);
  if (i >= 0) {
    ids.splice(i, 1);
    save(ids);
    return false;
  }
  ids.unshift(id);
  save(ids);
  return true;
}
