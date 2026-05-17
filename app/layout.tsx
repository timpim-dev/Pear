import type { Metadata } from "next";
import { Nunito, Geist_Mono } from "next/font/google";
import "./globals.css";

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pear — Share anything. Meet anyone. Privately.",
  description:
    "Peer-to-peer encrypted file transfer and video meetings. No servers, no sign-up, no traces.",
  openGraph: {
    title: "Pear",
    description: "Share anything. Meet anyone. Privately.",
    type: "website",
  },
};

// Theme init script — runs before first paint to avoid flash.
// Must be a plain string, no template literals with backticks inside.
const themeScript = `(function(){try{var t=localStorage.getItem('pear-theme');var d=window.matchMedia('(prefers-color-scheme:dark)').matches;if(t==='dark'||(t===null&&d)){document.documentElement.classList.add('dark');}}catch(e){}})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${nunito.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      {/*
       * Do NOT add a <head> tag here — Next.js App Router manages <head> itself.
       * Adding one causes a hydration mismatch that prevents React from attaching
       * event handlers (buttons appear to work but do nothing).
       *
       * Instead, use the Next.js `Script` component or place inline scripts
       * directly as children of <html> before <body>.
       */}
      <body className="min-h-full flex flex-col bg-surface text-fg">
        {/* Inline theme script — before any content so there's no flash */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
