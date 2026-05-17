"use client";

import { nanoid } from "nanoid";
import { ThemeToggle } from "@/components/ThemeToggle";

// Generate a cryptographically-safe base64url key for AES-GCM (256-bit).
// The key lives ONLY in the URL hash — never sent to the server.
async function generateRoomUrl(type: "file" | "call"): Promise<string> {
  const roomId = nanoid(12);
  const key = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const rawKey = await window.crypto.subtle.exportKey("raw", key);
  const keyB64 = btoa(String.fromCharCode(...new Uint8Array(rawKey)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  // Hash fragment (#key) is never included in HTTP requests
  return `/${type === "file" ? "room" : "call"}/${roomId}#${keyB64}`;
}

export default function Home() {
  // Use window.location.href (not router.push) — Next.js App Router strips hash fragments
  async function handleSendFile() {
    window.location.href = await generateRoomUrl("file");
  }
  async function handleStartCall() {
    window.location.href = await generateRoomUrl("call");
  }

  return (
    <main className="flex-1 flex flex-col">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-5xl mx-auto w-full">
        <span className="text-2xl font-extrabold tracking-tight text-fg">
          Pear
        </span>
        <div className="flex items-center gap-4">
          <a
            href="/about"
            className="text-sm font-semibold text-fg-muted hover:text-pear-green transition-colors"
          >
            How it works
          </a>
          <ThemeToggle />
        </div>
      </nav>

      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center animate-fade-in">
        {/* Logo mark */}
        <div className="w-24 h-24 rounded-[2rem] bg-pear-green flex items-center justify-center shadow-lg shadow-pear-green/30 mb-8 hover:scale-105 transition-transform duration-300">
          <svg viewBox="0 0 48 56" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-14 h-14" aria-hidden="true">
            <path d="M24 50C13 50 5 41 5 30C5 20 12 14 18 11C19 8 18 5 16 3" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <path d="M24 50C35 50 43 41 43 30C43 20 36 14 30 11C29 8 30 5 32 3" stroke="white" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <path d="M24 50C13 50 5 41 5 30C5 20 12 14 18 11C21 9 24 7 24 5C24 7 27 9 30 11C36 14 43 20 43 30C43 41 35 50 24 50Z" fill="white" fillOpacity="0.92" />
            <path d="M24 5C24 3.5 23 1.5 21 1" stroke="white" strokeWidth="2" strokeLinecap="round" />
            <path d="M24 4C26 2 29.5 1.5 30 3.5C28 5 25 5.5 24 4Z" fill="white" fillOpacity="0.85" />
          </svg>
        </div>

        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-fg leading-tight mb-4">
          Pear
        </h1>
        <p className="text-xl sm:text-2xl text-fg-muted font-medium max-w-lg mx-auto mb-3">
          Share anything. Meet anyone. Privately.
        </p>
        <p className="text-sm text-fg-muted/70 max-w-md mx-auto mb-12">
          End-to-end encrypted, peer-to-peer — your files and video go directly
          between browsers. Nothing touches a server.
        </p>

        {/* CTAs */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <button
            onClick={handleSendFile}
            className="group px-8 py-4 rounded-2xl bg-pear-green text-white font-bold text-lg shadow-md shadow-pear-green/30 hover:bg-pear-green-dark hover:shadow-lg hover:shadow-pear-green/40 active:scale-95 transition-all duration-200"
          >
            Send a File
            <span className="inline-block ml-2 group-hover:translate-x-1 transition-transform duration-200">&rarr;</span>
          </button>
          <button
            onClick={handleStartCall}
            className="group px-8 py-4 rounded-2xl bg-card text-fg font-bold text-lg border-2 border-border-pear hover:border-pear-green hover:bg-pear-green/5 shadow-sm active:scale-95 transition-all duration-200"
          >
            Start a Call
            <span className="inline-block ml-2 group-hover:translate-x-1 transition-transform duration-200">&rarr;</span>
          </button>
        </div>
      </section>

      {/* Feature strip */}
      <section className="border-t border-border-pear bg-card/50 py-12 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8">
          {[
            { title: "No accounts",        desc: "Create a room and share the link. That is it." },
            { title: "Zero server storage", desc: "Files and video travel peer-to-peer. We never see your data." },
            { title: "AES-256 encrypted",  desc: "The encryption key lives only in the URL hash — invisible to the server." },
          ].map((f) => (
            <div key={f.title} className="card-hover p-6 rounded-2xl bg-card border border-border-pear">
              <div className="w-2 h-2 rounded-full bg-pear-green mb-4" />
              <h3 className="font-bold text-fg mb-1">{f.title}</h3>
              <p className="text-sm text-fg-muted leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center py-6 text-xs text-fg-muted/60 border-t border-border-pear">
        Pear is open source. Your privacy is the product.
      </footer>
    </main>
  );
}
