// 사용자 플레이리스트 — localStorage 저장 + URL 공유 인코딩 (클라이언트 전용, 데이터 import 없음)

export interface Playlist {
  id: string;
  name: string;
  songIds: string[];
  updatedAt: number;
}

const KEY = "flare:playlists:v1";

function read(): Playlist[] {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function write(list: Playlist[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}

function uid(): string {
  return "pl_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function loadPlaylists(): Playlist[] {
  return read().sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getPlaylist(id: string): Playlist | undefined {
  return read().find((p) => p.id === id);
}

export function createPlaylist(name: string, songIds: string[] = []): Playlist {
  const list = read();
  const pl: Playlist = {
    id: uid(),
    name: name.trim() || "Playlist",
    songIds: [...new Set(songIds)],
    updatedAt: Date.now(),
  };
  list.push(pl);
  write(list);
  return pl;
}

export function renamePlaylist(id: string, name: string): void {
  const list = read();
  const pl = list.find((p) => p.id === id);
  if (!pl) return;
  pl.name = name.trim() || pl.name;
  pl.updatedAt = Date.now();
  write(list);
}

export function deletePlaylist(id: string): void {
  write(read().filter((p) => p.id !== id));
}

export function addToPlaylist(id: string, songId: string): void {
  const list = read();
  const pl = list.find((p) => p.id === id);
  if (!pl) return;
  if (!pl.songIds.includes(songId)) pl.songIds.push(songId);
  pl.updatedAt = Date.now();
  write(list);
}

export function removeFromPlaylist(id: string, songId: string): void {
  const list = read();
  const pl = list.find((p) => p.id === id);
  if (!pl) return;
  pl.songIds = pl.songIds.filter((s) => s !== songId);
  pl.updatedAt = Date.now();
  write(list);
}

export function isInPlaylist(id: string, songId: string): boolean {
  return !!getPlaylist(id)?.songIds.includes(songId);
}

// ── URL 공유 인코딩 (서버 없이) ──────────────────────────────────────
// { n: name, s: songIds } → base64url

function b64urlEncode(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeShare(name: string, songIds: string[]): string {
  return b64urlEncode(JSON.stringify({ n: name, s: songIds }));
}

export function decodeShare(param: string): { name: string; songIds: string[] } | null {
  try {
    const obj = JSON.parse(b64urlDecode(param));
    if (!obj || !Array.isArray(obj.s)) return null;
    return { name: String(obj.n ?? "Playlist"), songIds: obj.s.map(String) };
  } catch {
    return null;
  }
}
