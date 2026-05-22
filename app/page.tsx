"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * Generate a short, human-readable 6-character room code.
 * Uses uppercase letters + digits, excluding ambiguous chars (0/O, 1/I/L).
 */
function generateRoomCode(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [createdCode, setCreatedCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [joinError, setJoinError] = useState("");

  function handleCreateRoom() {
    const code = generateRoomCode();
    setCreatedCode(code);
    setCopied(false);
  }

  function handleJoinRoom() {
    const code = joinCode.trim().toUpperCase().replace(/\s/g, "");
    if (code.length < 4) {
      setJoinError("Enter a valid room code");
      return;
    }
    setJoinError("");
    router.push(`/call/${code}`);
  }

  function handleGoToRoom() {
    router.push(`/call/${createdCode}`);
  }

  function handleCopyCode() {
    navigator.clipboard.writeText(createdCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
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
          Video calls with a room code. That&apos;s it.
        </p>
        <p className="text-sm text-fg-muted/70 max-w-md mx-auto mb-12">
          End-to-end encrypted, peer-to-peer — your video goes directly
          between browsers. Nothing touches a server.
        </p>

        {/* Room code actions */}
        <div className="w-full max-w-md space-y-4">
          {/* Create room */}
          {!createdCode ? (
            <button
              onClick={handleCreateRoom}
              className="w-full group px-8 py-4 rounded-2xl bg-pear-green text-white font-bold text-lg shadow-md shadow-pear-green/30 hover:bg-pear-green-dark hover:shadow-lg hover:shadow-pear-green/40 active:scale-95 transition-all duration-200"
            >
              Create a Room
              <span className="inline-block ml-2 group-hover:translate-x-1 transition-transform duration-200">&rarr;</span>
            </button>
          ) : (
            <div className="bg-card border-2 border-pear-green/30 rounded-2xl p-6 animate-fade-in">
              <p className="text-sm text-fg-muted mb-3">Your room code:</p>
              <div className="flex items-center justify-center gap-1 mb-4">
                {createdCode.split("").map((char, i) => (
                  <span
                    key={i}
                    className="w-11 h-14 flex items-center justify-center rounded-xl bg-subtle border border-border-pear text-2xl font-extrabold text-fg tracking-widest font-mono"
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    {char}
                  </span>
                ))}
              </div>
              <p className="text-xs text-fg-muted/60 mb-4">
                Share this code with whoever you want to call
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleCopyCode}
                  className="flex-1 py-3 rounded-2xl bg-subtle text-fg font-bold border border-border-pear hover:bg-pear-green/10 active:scale-95 transition-all"
                >
                  {copied ? "Copied ✓" : "Copy Code"}
                </button>
                <button
                  onClick={handleGoToRoom}
                  className="flex-1 py-3 rounded-2xl bg-pear-green text-white font-bold hover:bg-pear-green-dark active:scale-95 transition-all shadow-md shadow-pear-green/30"
                >
                  Join Room &rarr;
                </button>
              </div>
            </div>
          )}

          {/* Divider */}
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-border-pear" />
            <span className="text-xs text-fg-muted/50 font-semibold uppercase tracking-wider">or</span>
            <div className="flex-1 h-px bg-border-pear" />
          </div>

          {/* Join room */}
          <div className="bg-card border border-border-pear rounded-2xl p-6">
            <p className="text-sm font-semibold text-fg mb-3">Join with a code</p>
            <div className="flex gap-3">
              <input
                type="text"
                placeholder="Enter room code"
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(e.target.value.toUpperCase());
                  setJoinError("");
                }}
                onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
                maxLength={8}
                className="flex-1 px-4 py-3 rounded-xl bg-subtle border border-border-pear text-fg font-mono text-lg tracking-widest text-center placeholder:text-fg-muted/30 placeholder:tracking-normal placeholder:font-sans placeholder:text-sm focus:border-pear-green transition-colors"
              />
              <button
                onClick={handleJoinRoom}
                className="px-6 py-3 rounded-xl bg-pear-green text-white font-bold hover:bg-pear-green-dark active:scale-95 transition-all shadow-md shadow-pear-green/30"
              >
                Join
              </button>
            </div>
            {joinError && (
              <p className="text-red-400 text-xs mt-2 animate-fade-in">{joinError}</p>
            )}
          </div>
        </div>
      </section>

      {/* Feature strip */}
      <section className="border-t border-border-pear bg-card/50 py-12 px-6">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8">
          {[
            { title: "No accounts",        desc: "Create a room, share the code. That's it." },
            { title: "Zero server storage", desc: "Video travels peer-to-peer. We never see your data." },
            { title: "Room codes",          desc: "Short, easy-to-share codes. No messy links needed." },
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
