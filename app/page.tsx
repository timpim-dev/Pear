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

/**
 * Generate a file-transfer room URL with an AES-256-GCM key in the hash.
 * The key never leaves the browser via HTTP — it stays in the fragment.
 */
async function generateFileRoomUrl(): Promise<string> {
  const roomId = generateRoomCode();
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
  return `/room/${roomId}#${keyB64}`;
}

type Mode = "none" | "call" | "file";

export default function Home() {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState("");
  const [createdCode, setCreatedCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [joinError, setJoinError] = useState("");
  const [mode, setMode] = useState<Mode>("none");

  // File sharing state
  const [fileRoomUrl, setFileRoomUrl] = useState("");
  const [fileCopied, setFileCopied] = useState(false);
  const [generatingFile, setGeneratingFile] = useState(false);

  function handleCreateRoom() {
    const code = generateRoomCode();
    setCreatedCode(code);
    setCopied(false);
    setMode("call");
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

  async function handleCreateFileRoom() {
    setGeneratingFile(true);
    try {
      const url = await generateFileRoomUrl();
      // Build full URL so it can be shared cross-device
      const fullUrl = `${window.location.origin}${url}`;
      setFileRoomUrl(fullUrl);
      setMode("file");
    } catch (err) {
      console.error("Failed to generate file room:", err);
    } finally {
      setGeneratingFile(false);
    }
  }

  function handleCopyFileUrl() {
    navigator.clipboard.writeText(fileRoomUrl).then(() => {
      setFileCopied(true);
      setTimeout(() => setFileCopied(false), 2000);
    });
  }

  function handleGoToFileRoom() {
    // Navigate using the full relative URL including the hash
    window.location.href = fileRoomUrl;
  }

  return (
    <main className="flex-1 flex flex-col">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-5 max-w-5xl mx-auto w-full">
        <span className="text-2xl font-extrabold tracking-tight text-fg">
          <PearWordmark />
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
          <PearIcon className="w-14 h-14 text-white" />
        </div>

        <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-fg leading-tight mb-4">
          Pear
        </h1>
        <p className="text-xl sm:text-2xl text-fg-muted font-medium max-w-lg mx-auto mb-3">
          Share files &amp; video call. That&apos;s it.
        </p>
        <p className="text-sm text-fg-muted/70 max-w-md mx-auto mb-12">
          End-to-end encrypted, peer-to-peer — your data goes directly
          between browsers. Nothing touches a server.
        </p>

        {/* Action cards */}
        <div className="w-full max-w-md space-y-4">
          {/* ── Mode selector (when nothing is active) ─── */}
          {mode === "none" && (
            <>
              <button
                onClick={handleCreateRoom}
                className="w-full group px-8 py-4 rounded-2xl bg-pear-green text-white font-bold text-lg shadow-md shadow-pear-green/30 hover:bg-pear-green-dark hover:shadow-lg hover:shadow-pear-green/40 active:scale-95 transition-all duration-200 flex items-center justify-center gap-3"
              >
                <VideoIcon className="w-5 h-5" />
                Create a Video Room
                <ArrowIcon className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
              </button>

              <button
                onClick={handleCreateFileRoom}
                disabled={generatingFile}
                className="w-full group px-8 py-4 rounded-2xl bg-card text-fg font-bold text-lg border-2 border-border-pear hover:border-pear-green hover:bg-pear-green/5 active:scale-95 transition-all duration-200 flex items-center justify-center gap-3"
              >
                <FileIcon className="w-5 h-5" />
                {generatingFile ? "Creating..." : "Share a File"}
                <ArrowIcon className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
              </button>
            </>
          )}

          {/* ── Created call room ─── */}
          {mode === "call" && createdCode && (
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
                  className="flex-1 py-3 rounded-2xl bg-subtle text-fg font-bold border border-border-pear hover:bg-pear-green/10 active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <CopyIcon className="w-4 h-4" />
                  {copied ? "Copied ✓" : "Copy Code"}
                </button>
                <button
                  onClick={handleGoToRoom}
                  className="flex-1 py-3 rounded-2xl bg-pear-green text-white font-bold hover:bg-pear-green-dark active:scale-95 transition-all shadow-md shadow-pear-green/30 flex items-center justify-center gap-2"
                >
                  Join Room
                  <ArrowIcon className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => { setMode("none"); setCreatedCode(""); }}
                className="mt-3 text-xs text-fg-muted/50 hover:text-fg-muted transition-colors"
              >
                ← Back
              </button>
            </div>
          )}

          {/* ── Created file room ─── */}
          {mode === "file" && fileRoomUrl && (
            <div className="bg-card border-2 border-pear-green/30 rounded-2xl p-6 animate-fade-in">
              <div className="flex items-center justify-center gap-2 mb-3">
                <FileIcon className="w-5 h-5 text-pear-green" />
                <p className="text-sm font-semibold text-fg">File transfer room ready</p>
              </div>
              <p className="text-xs text-fg-muted/60 mb-4">
                Share this link with the person you want to exchange files with.
                The encryption key is embedded in the link — anyone with the link can access the room.
              </p>
              <div className="flex items-center gap-2 mb-4">
                <input
                  readOnly
                  value={fileRoomUrl}
                  className="flex-1 text-xs font-mono bg-subtle border border-border-pear rounded-xl px-3 py-2 truncate text-fg"
                />
                <button
                  onClick={handleCopyFileUrl}
                  className="shrink-0 px-4 py-2 rounded-xl bg-pear-green text-white text-sm font-bold hover:bg-pear-green-dark transition-colors flex items-center gap-1.5"
                >
                  <CopyIcon className="w-3.5 h-3.5" />
                  {fileCopied ? "Copied!" : "Copy"}
                </button>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setMode("none"); setFileRoomUrl(""); }}
                  className="flex-1 py-3 rounded-2xl bg-subtle text-fg font-bold border border-border-pear hover:bg-pear-green/10 active:scale-95 transition-all"
                >
                  ← Back
                </button>
                <button
                  onClick={handleGoToFileRoom}
                  className="flex-1 py-3 rounded-2xl bg-pear-green text-white font-bold hover:bg-pear-green-dark active:scale-95 transition-all shadow-md shadow-pear-green/30 flex items-center justify-center gap-2"
                >
                  Open Room
                  <ArrowIcon className="w-4 h-4" />
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
            { icon: <LockIcon className="w-5 h-5 text-pear-green" />, title: "End-to-end encrypted", desc: "AES-256-GCM for files. DTLS-SRTP for video. We never see your data." },
            { icon: <PeerIcon className="w-5 h-5 text-pear-green" />, title: "Peer-to-peer",         desc: "Data flows directly between browsers. No servers in between." },
            { icon: <CodeIcon className="w-5 h-5 text-pear-green" />, title: "Room codes",            desc: "Short, easy-to-share codes. No messy links for calls." },
          ].map((f) => (
            <div key={f.title} className="card-hover p-6 rounded-2xl bg-card border border-border-pear">
              <div className="mb-4">{f.icon}</div>
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

// ─── Icon Components ────────────────────────────────────────────────────────────

function PearWordmark() {
  return (
    <span className="inline-flex items-center gap-1.5">
      <PearIcon className="w-6 h-6 text-pear-green" />
      <span>Pear</span>
    </span>
  );
}

function PearIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 40" fill="none" className={className} aria-hidden="true">
      {/* Leaf */}
      <path
        d="M16 3C17.5 1.5 20 1 21 2.5C19.5 4 17 4.5 16 3Z"
        fill="currentColor"
        opacity="0.7"
      />
      {/* Stem */}
      <path
        d="M16 3.5V8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Body */}
      <path
        d="M16 8C12 8 8.5 11 7 15C5.5 19 5 24 8 29C10.5 33 13 35 16 35C19 35 21.5 33 24 29C27 24 26.5 19 25 15C23.5 11 20 8 16 8Z"
        fill="currentColor"
        opacity="0.92"
      />
      {/* Highlight */}
      <ellipse cx="12" cy="20" rx="2.5" ry="4" fill="white" opacity="0.15" transform="rotate(-15 12 20)" />
    </svg>
  );
}

function ArrowIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M3.5 8H12.5M9 4.5L12.5 8L9 11.5" />
    </svg>
  );
}

function VideoIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="2" y="5" width="14" height="14" rx="2" />
      <path d="M16 9.5L22 6V18L16 14.5" />
    </svg>
  );
}

function FileIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V8L14 2Z" />
      <path d="M14 2V8H20" />
      <path d="M12 18V12M9 15L12 12L15 15" />
    </svg>
  );
}

function CopyIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4C2.9 15 2 14.1 2 13V4C2 2.9 2.9 2 4 2H13C14.1 2 15 2.9 15 4V5" />
    </svg>
  );
}

function LockIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7C7 4.2 9.2 2 12 2C14.8 2 17 4.2 17 7V11" />
      <circle cx="12" cy="16.5" r="1.5" fill="currentColor" />
    </svg>
  );
}

function PeerIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="12" r="3" />
      <path d="M9 12H15" />
      <path d="M12 9L15 12L12 15" />
    </svg>
  );
}

function CodeIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M8 10L6 12L8 14" />
      <path d="M16 10L18 12L16 14" />
      <path d="M13 8L11 16" />
    </svg>
  );
}
