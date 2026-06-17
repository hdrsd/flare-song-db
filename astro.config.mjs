import { defineConfig } from "astro/config";
import { fileURLToPath } from "node:url";

// MVP는 100% 정적 사이트 → Cloudflare Pages가 그대로 서빙(어댑터 불필요, 트래픽 $0).
// 추후 SSR 엔드포인트(예: 조회수 프록시)가 필요해지면 @astrojs/cloudflare 어댑터를 추가한다.
export default defineConfig({
  site: "https://song.flare.moe",
  output: "static",
  i18n: {
    locales: ["ja", "ko"],
    defaultLocale: "ja",
    routing: { prefixDefaultLocale: false },
  },
  vite: {
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
  },
});
