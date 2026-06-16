import type { Locale } from "@/types/song";

type Dict = Record<string, string>;

const ja: Dict = {
  "site.name": "フレア楽曲データベース",
  "site.tagline": "不知火フレアが歌った楽曲のまとめ（非公式ファンサイト）",
  "nav.home": "ホーム",
  "nav.songs": "楽曲一覧",
  "nav.search": "検索",
  "nav.watch": "再生",
  "home.recent": "最近追加された楽曲",
  "home.browse": "一覧を見る",
  "songs.title": "楽曲一覧",
  "songs.count": "{n} 曲",
  "songs.more": "もっと見る",
  "songs.all": "すべて",
  "common.loading": "読み込み中…",
  "filter.quick": "リスト内をしぼり込み… (例: tag:カバー)",
  "filter.year": "年",
  "filter.tag": "タグ",
  "sort.newest": "新しい順",
  "sort.oldest": "古い順",
  "sort.title": "タイトル順",
  "sort.duration": "長い順",
  "search.title": "検索",
  "search.placeholder": "曲名・アーティスト・タグ… (例: tag:カバー artist:ポルカ)",
  "search.hint": "接頭辞: title: / artist: / sing: / tag: / year: / milestone:  ・ 除外は -keyword",
  "search.results": "{n} 件",
  "search.empty": "検索結果がありません",
  "search.tags": "タグから探す",
  "watch.title": "再生",
  "watch.queue": "再生キュー",
  "watch.pick": "左の一覧から楽曲を選んで再生",
  "watch.songMode": "曲モード（区間のみ）",
  "label.artist": "アーティスト",
  "label.sing": "歌唱",
  "label.date": "配信日",
  "label.tags": "タグ",
  "label.play": "再生",
  "disclaimer": "※ 非公式ファンサイトです。動画はYouTube公式チャンネルへ誘導します。",
};

const ko: Dict = {
  "site.name": "후레아 노래 데이터베이스",
  "site.tagline": "시라누이 후레아가 부른 노래 모음 (비공식 팬사이트)",
  "nav.home": "홈",
  "nav.songs": "곡 목록",
  "nav.search": "검색",
  "nav.watch": "재생",
  "home.recent": "최근 추가된 곡",
  "home.browse": "목록 보기",
  "songs.title": "곡 목록",
  "songs.count": "{n} 곡",
  "songs.more": "더 보기",
  "songs.all": "전체",
  "common.loading": "불러오는 중…",
  "filter.quick": "목록 내 빠른 필터… (예: tag:커버)",
  "filter.year": "연도",
  "filter.tag": "태그",
  "sort.newest": "최신순",
  "sort.oldest": "오래된순",
  "sort.title": "제목순",
  "sort.duration": "긴 순",
  "search.title": "검색",
  "search.placeholder": "곡명·아티스트·태그… (예: tag:커버 artist:폴카)",
  "search.hint": "접두사: title: / artist: / sing: / tag: / year: / milestone:  ・ 제외는 -키워드",
  "search.results": "{n} 건",
  "search.empty": "검색 결과가 없습니다",
  "search.tags": "태그로 찾기",
  "watch.title": "재생",
  "watch.queue": "재생 큐",
  "watch.pick": "왼쪽 목록에서 곡을 골라 재생하세요",
  "watch.songMode": "곡 모드 (구간만)",
  "label.artist": "아티스트",
  "label.sing": "부른 사람",
  "label.date": "방송일",
  "label.tags": "태그",
  "label.play": "재생",
  "disclaimer": "※ 비공식 팬사이트입니다. 영상은 YouTube 공식 채널로 연결됩니다.",
};

const DICTS: Record<Locale, Dict> = { ja, ko };

export function getLocale(astroLocale: string | undefined): Locale {
  return astroLocale === "ko" ? "ko" : "ja";
}

export function useT(locale: Locale) {
  const dict = DICTS[locale];
  return (key: string, vars?: Record<string, string | number>): string => {
    let s = dict[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
    return s;
  };
}
