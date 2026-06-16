// YouTube Data API v3 fetch 헬퍼 (웹 표준 fetch · 무료 한도 내).
// 워커 이식 시 그대로 재사용 가능(googleapis 라이브러리 미사용).

const BASE = "https://www.googleapis.com/youtube/v3";

function apiKey() {
  const k = process.env.YOUTUBE_API_KEY;
  if (!k) throw new Error("YOUTUBE_API_KEY 환경변수가 없습니다 (.dev.vars 참조)");
  return k;
}

async function get(path, params) {
  const url = new URL(`${BASE}/${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set("key", apiKey());
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube API ${path} ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

/** 핸들(@ShiranuiFlare) → { channelId, uploadsPlaylistId, title } */
export async function resolveChannel(handle) {
  const d = await get("channels", {
    part: "snippet,contentDetails",
    forHandle: handle.replace(/^@/, ""),
  });
  const it = d.items?.[0];
  if (!it) throw new Error(`채널을 찾을 수 없음: ${handle}`);
  return {
    channelId: it.id,
    uploadsPlaylistId: it.contentDetails.relatedPlaylists.uploads,
    title: it.snippet.title,
  };
}

/** 업로드 재생목록 전체(또는 max개) 순회 → [{videoId, title, publishedAt}] (최신순) */
export async function listUploads(uploadsPlaylistId, max = Infinity) {
  const out = [];
  let pageToken = "";
  do {
    const d = await get("playlistItems", {
      part: "snippet",
      maxResults: 50,
      playlistId: uploadsPlaylistId,
      ...(pageToken ? { pageToken } : {}),
    });
    for (const it of d.items ?? []) {
      out.push({
        videoId: it.snippet.resourceId.videoId,
        title: it.snippet.title,
        publishedAt: it.snippet.publishedAt,
      });
      if (out.length >= max) return out;
    }
    pageToken = d.nextPageToken || "";
  } while (pageToken);
  return out;
}

/** 영상 상세 (최대 50개씩) → Map<videoId, {duration, actualStartTime, publishedAt, title}> */
export async function videoDetails(videoIds) {
  const map = new Map();
  for (let i = 0; i < videoIds.length; i += 50) {
    const chunk = videoIds.slice(i, i + 50);
    const d = await get("videos", {
      part: "snippet,contentDetails,liveStreamingDetails",
      id: chunk.join(","),
    });
    for (const it of d.items ?? []) {
      map.set(it.id, {
        title: it.snippet.title,
        publishedAt: it.snippet.publishedAt,
        duration: it.contentDetails?.duration || "",
        actualStartTime: it.liveStreamingDetails?.actualStartTime || "",
        actualEndTime: it.liveStreamingDetails?.actualEndTime || "",
      });
    }
  }
  return map;
}

/** 상위 댓글(연관순) 텍스트 목록 (최대 maxResults) */
export async function topComments(videoId, maxResults = 100) {
  try {
    const d = await get("commentThreads", {
      part: "snippet",
      maxResults: Math.min(maxResults, 100),
      order: "relevance",
      videoId,
      textFormat: "plainText",
    });
    return (d.items ?? []).map((it) => {
      const s = it.snippet.topLevelComment.snippet;
      return { text: s.textOriginal, author: s.authorDisplayName, likes: s.likeCount };
    });
  } catch (e) {
    // 댓글 비활성화 등 → 빈 배열
    return [];
  }
}
