import type { APIRoute } from "astro";
import { getSongsByDateDesc, localizeAll, toCompact } from "@/lib/song";

// /ko/songs-index.json
export const prerender = true;

export const GET: APIRoute = () => {
  const data = localizeAll(getSongsByDateDesc(), "ko").map(toCompact);
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=86400, stale-while-revalidate=300",
    },
  });
};
