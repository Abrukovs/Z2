import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "sonner";
import { ThemeProvider } from "@/components/theme-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ставка Дня — ежедневные спортивные пики от ИИ",
  description: "Ежедневная подборка спортивных событий для ставок на основе веб-поиска и LLM-анализа. Футбол, баскетбол, теннис, хоккей.",
  keywords: ["ставки", "спорт", "прогнозы", "футбол", "баскетбол", "теннис", "хоккей", "пики", "ИИ"],
  authors: [{ name: "Z.ai" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "Ставка Дня — спортивные пики от ИИ",
    description: "Ежедневная подборка спортивных событий для ставок на основе веб-поиска и LLM-анализа.",
    url: "https://chat.z.ai",
    siteName: "Z.ai",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Ставка Дня — спортивные пики от ИИ",
    description: "Ежедневная подборка спортивных событий для ставок.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* Скрипт применяется тему ДО гидратации — избегаем мигания (FOUC) */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&m)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
          <SonnerToaster
            position="bottom-right"
            richColors
            closeButton
            toastOptions={{
              classNames: {
                toast: 'rounded-lg border shadow-lg',
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  );
}
