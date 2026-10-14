import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Отключаем DevTools overlay (висящее уведомление "Long run task completed" с будильником)
  devIndicators: false,
  // Разрешаем cross-origin запросы к /_next/* чанкам из preview-доменов
  // Без этого Next.js 16 блокирует загрузку чанков (ChunkLoadError) при обращении
  // с preview-*.space-z.ai доменов к localhost:3000
  // ВАЖНО: ChunkLoadError также возникает при перезапуске dev сервера —
  // браузер запрашивает старые чанки. Решение: hard refresh (Ctrl+Shift+R)
  allowedDevOrigins: [
    "*.space-z.ai",
    "preview-chat-*.space-z.ai",
    "*.preview-chat-*.space-z.ai",
    "localhost",
    "127.0.0.1",
  ],
};

export default nextConfig;
