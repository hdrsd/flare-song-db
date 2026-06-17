// 전역 영속 플레이어 — 페이지 이동(SPA)에도 재생 유지.
// window.flarePlayer 싱글턴. 상태 변경 시 document에 "flare:change" 이벤트.

import type { CompactSong } from "./songs.shared";
import { isFavorite, toggleFavorite } from "./favorites";
import { bumpCount } from "./playcounts";
import { thumbUrl, escapeHtml } from "./songs.shared";

export type RepeatMode = 0 | 1 | 2; // off / 전체 / 한곡

class FlarePlayer {
  all: CompactSong[] = [];
  byId = new Map<string, CompactSong>();
  videoIndex = new Map<string, CompactSong[]>();
  queue: CompactSong[] = [];
  idx = -1;
  song: CompactSong | null = null;
  yt: any = null;
  loadedVid = "";
  playing = false;
  shuffle = false;
  repeat: RepeatMode = 0;
  songMode = true;
  ticker?: number;
  ready = false;
  indexReady: Promise<void>;
  private resolveIndex!: () => void;
  private indexUrl: string;

  constructor() {
    // 로케일별 인덱스
    const ko = location.pathname === "/ko" || location.pathname.startsWith("/ko/");
    this.indexUrl = ko ? "/ko/songs-index.json" : "/songs-index.json";
    this.indexReady = new Promise((r) => (this.resolveIndex = r));
    this.boot();
  }

  private async boot() {
    try {
      const data: CompactSong[] = await (await fetch(this.indexUrl)).json();
      this.all = data;
      for (const s of data) {
        this.byId.set(s.id, s);
        if (!this.videoIndex.has(s.v)) this.videoIndex.set(s.v, []);
        this.videoIndex.get(s.v)!.push(s);
      }
      for (const segs of this.videoIndex.values()) segs.sort((a, b) => a.st - b.st);
    } catch {
      /* index 로드 실패 → 빈 상태 */
    }
    this.resolveIndex();
    this.loadYT();
  }

  private loadYT() {
    const make = () => {
      const host = document.getElementById("gp-yt");
      if (!host) { setTimeout(make, 100); return; }
      this.yt = new (window as any).YT.Player("gp-yt", {
        width: "100%", height: "100%",
        playerVars: { playsinline: 1, rel: 0 },
        events: {
          onReady: () => { this.ready = true; this.startTicker(); this.emit(); },
          onStateChange: (e: any) => {
            if (e.data === 1) this.playing = true;
            else if (e.data === 2) this.playing = false;
            else if (e.data === 0) this.next();
            this.emit();
          },
        },
      });
    };
    if ((window as any).YT?.Player) make();
    else {
      const prev = (window as any).onYouTubeIframeAPIReady;
      (window as any).onYouTubeIframeAPIReady = () => { prev?.(); make(); };
      if (!document.getElementById("yt-iframe-api")) {
        const tag = document.createElement("script");
        tag.id = "yt-iframe-api"; tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
    }
    this.startTicker();
  }

  private startTicker() {
    if (this.ticker) return;
    this.ticker = window.setInterval(() => {
      if (!this.yt || !this.song) return;
      if (this.songMode && this.song.e > this.song.st && (this.yt.getCurrentTime?.() ?? 0) >= this.song.e) this.next();
    }, 400);
  }

  segs(videoId: string) { return this.videoIndex.get(videoId) ?? []; }

  setQueue(songs: CompactSong[]) { this.queue = songs && songs.length ? songs : this.all; }
  ensureQueue() { if (!this.queue.length) this.queue = this.all; }

  playIndex(i: number) {
    if (i < 0 || i >= this.queue.length) return;
    this.playSong(this.queue[i], i);
  }
  playId(id: string) {
    this.ensureQueue();
    const i = this.queue.findIndex((s) => s.id === id);
    if (i >= 0) this.playSong(this.queue[i], i);
    else if (this.byId.has(id)) this.playSong(this.byId.get(id)!, -1);
  }
  playSong(s: CompactSong, idx: number) {
    this.song = s; this.idx = idx;
    bumpCount(s.id);
    if (this.yt) {
      if (this.loadedVid === s.v) { this.yt.seekTo(s.st, true); this.yt.playVideo(); }
      else { this.loadedVid = s.v; this.yt.loadVideoById({ videoId: s.v, startSeconds: s.st }); }
    }
    this.playing = true;
    this.emit();
  }
  toggle() {
    if (!this.yt) return;
    if (this.playing) this.yt.pauseVideo();
    else { this.yt.playVideo(); if (!this.song && this.queue.length) this.playIndex(0); }
  }
  next() {
    if (this.repeat === 2 && this.song) { this.playSong(this.song, this.idx); return; }
    if (this.shuffle && this.queue.length > 1) {
      let r = this.idx; while (r === this.idx) r = Math.floor(Math.random() * this.queue.length);
      this.playIndex(r); return;
    }
    if (this.idx >= 0 && this.idx + 1 < this.queue.length) { this.playIndex(this.idx + 1); return; }
    if (this.idx >= 0 && this.repeat === 1 && this.queue.length) { this.playIndex(0); return; }
    if (this.song) { // 큐 밖이면 같은 영상 다음 구간
      const ss = this.segs(this.song.v); const j = ss.findIndex((x) => x.id === this.song!.id);
      if (j >= 0 && j + 1 < ss.length) { const ns = ss[j + 1]; this.playSong(ns, this.queue.findIndex((x) => x.id === ns.id)); }
    }
  }
  prev() {
    if (this.yt && (this.yt.getCurrentTime?.() ?? 0) - (this.song?.st ?? 0) > 3) { this.yt.seekTo(this.song!.st, true); return; }
    if (this.idx > 0) this.playIndex(this.idx - 1);
    else if (this.song) this.yt?.seekTo(this.song.st, true);
  }
  seekSeg(id: string) { const s = this.byId.get(id); if (s) this.playSong(s, this.queue.findIndex((x) => x.id === id)); }

  setShuffle(v: boolean) { this.shuffle = v; this.emit(); }
  cycleRepeat() { this.repeat = ((this.repeat + 1) % 3) as RepeatMode; this.emit(); }
  setSongMode(v: boolean) { this.songMode = v; this.emit(); }
  toggleFav() { if (this.song) { toggleFavorite(this.song.id); this.emit(); } }
  isFav() { return this.song ? isFavorite(this.song.id) : false; }

  private emit() {
    this.renderBar();
    document.dispatchEvent(new CustomEvent("flare:change"));
  }

  // 하단 미니바 갱신
  renderBar() {
    const bar = document.getElementById("gp");
    if (!bar) return;
    bar.dataset.state = this.song ? "on" : "idle";
    const s = this.song;
    const set = (id: string, html: string) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
    set("gp-title", s ? escapeHtml(s.t) : "");
    set("gp-artist", s ? escapeHtml(s.a) : "");
    const thumb = document.getElementById("gp-thumb") as HTMLImageElement | null;
    if (thumb && s) { thumb.src = thumbUrl(s.v); }
    const pp = document.getElementById("gp-pp"); if (pp) pp.textContent = this.playing ? "⏸" : "▶";
    const fav = document.getElementById("gp-fav"); if (fav) { fav.textContent = this.isFav() ? "♥" : "♡"; fav.classList.toggle("on", this.isFav()); }
  }
}

export function getPlayer(): FlarePlayer {
  const w = window as any;
  if (!w.flarePlayer) w.flarePlayer = new FlarePlayer();
  return w.flarePlayer as FlarePlayer;
}
