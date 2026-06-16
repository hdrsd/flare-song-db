import type { APIRoute } from "astro";
import { getSongsByDateDesc, localizeAll, toCompact } from "@/lib/song";

// 정적 빌드 시 /songs-index.json 으로 생성 (CDN 캐시). 클라이언트가 fetch.
export const prerender = true;

export const GET: APIRoute = () => {
  const data = localizeAll(getSongsByDateDesc(), "ja").map(toCompact);
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=300",
    },
  });
};
