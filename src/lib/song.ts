import type { Locale, Song } from "@/types/song";
import rawSongs from "@/data/songs.json";
import { thumbUrl, fmtTime, fmtDate, type CompactSong } from "./songs.shared";

// 서버(빌드)에서만 songs.json 을 import. 클라이언트는 songs.shared + fetch(compact 인덱스) 사용.
export { thumbUrl, fmtTime, fmtDate };
export type { CompactSong };

const SONGS = rawSongs as Song[];

export function getAllSongs(): Song[] {
  return SONGS;
}

/** 방송일 내림차순(최신순) */
export function getSongsByDateDesc(): Song[] {
  return [...SONGS].sort(
    (a, b) =>
      new Date(b.albumReleaseAt || b.broadcastAt).getTime() -
      new Date(a.albumReleaseAt || a.broadcastAt).getTime(),
  );
}

export function getSongById(id: string): Song | undefined {
  return SONGS.find((s) => s.id === id);
}

/** 로케일에 맞춰 표시 필드를 채운다(ko 없으면 ja 폴백) */
export function localize(song: Song, locale: Locale): Song {
  const fields = (locale === "ko" && song.hl.ko) || song.hl.ja;
  return {
    ...song,
    title: fields.title || song.hl.ja.title,
    artist: fields.artist || song.hl.ja.artist,
    artists: fields.artists?.length ? fields.artists : song.hl.ja.artists,
    sing: fields.sing ?? song.sing,
    sings: fields.sings?.length ? fields.sings : song.sings,
    album: fields.album ?? song.album,
  };
}

export function localizeAll(songs: Song[], locale: Locale): Song[] {
  return songs.map((s) => localize(s, locale));
}

/** 앨범아트 우선, 없으면 YouTube 썸네일 폴백 */
export function coverUrl(song: Song, q = "hqdefault"): string {
  return song.albumArt || thumbUrl(song.videoId, q);
}

/** Song → 클라이언트 전송용 compact 인덱스 항목 */
export function toCompact(song: Song): CompactSong {
  return {
    id: song.id,
    t: song.title,
    a: song.artist,
    s: song.sing,
    g: song.tags,
    y: song.year,
    v: song.videoId,
    st: song.start,
    e: song.end,
    d: fmtDate(song.broadcastAt),
  };
}

// ── 곡 분류 규칙 (DATA-MODEL §5, 후레아 태그 기준) ────────────────────
export const isOriginal = (s: Song) => s.tags.includes("오리지널");
export const isCover = (s: Song) => s.tags.includes("커버");
export const isCollaboration = (s: Song) =>
  s.tags.includes("유닛") ||
  s.tags.includes("게스트") ||
  (s.tags.includes("홀로전체곡") && s.sing.includes("フレア"));
export const isUtawaku = (s: Song) => s.tags.includes("歌枠");

/** 태그 facet 집계(서버용) */
export function collectTags(songs: Song[]): { tag: string; count: number }[] {
  const m = new Map<string, number>();
  for (const s of songs) for (const t of s.tags) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}
