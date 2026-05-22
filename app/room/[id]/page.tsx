"use client";

/**
 * File Transfer Room — /room/[id]
 *
 * How it works:
 *   1. The creator ("sender") arrives first and sees a file picker + shareable link.
 *   2. The receiver opens the link and waits for the file.
 *   3. A WebRTC DataChannel is established via simple-peer + Ably signaling.
 *   4. The sender reads the file in CHUNK_SIZE (16 KiB) slices, encrypts each
 *      chunk with AES-GCM using the key from the URL hash, and sends it.
 *   5. The receiver decrypts each chunk, assembles the file, and offers a download.
 *
 * The encryption key is derived from window.location.hash — it is NEVER
 * sent in HTTP requests, so the server is blind to it.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import SimplePeer from "simple-peer";
import { SignalingChannel } from "@/lib/signaling";
import { importKeyFromHash, encryptChunk, decryptChunk, CHUNK_SIZE } from "@/lib/crypto";
import { ThemeToggle } from "@/components/ThemeToggle";

type Role = "sender" | "receiver" | "unknown";
type Status =
  | "idle"
  | "waiting"
  | "connecting"
  | "connected"
  | "transferring"
  | "done"
  | "error";

interface FileHeader {
  name: string;
  size: number;
  type: string;
}

export default function RoomPage() {
  const params = useParams();
  const roomId = params.id as string;

  const [role, setRole] = useState<Role>("unknown");
  const [status, setStatus] = useState<Status>("idle");
  const [progress, setProgress] = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [fileHeader, setFileHeader] = useState<FileHeader | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  const signalingRef = useRef<SignalingChannel | null>(null);
  const peerRef = useRef<SimplePeer.Instance | null>(null);
  const keyRef = useRef<CryptoKey | null>(null);
  const receivedChunksRef = useRef<Uint8Array[]>([]);
  const receivedSizeRef = useRef(0);
  const roleSetRef = useRef(false);

  useEffect(() => {
    setShareUrl(window.location.href);

    // crypto.subtle requires a secure context (HTTPS or localhost).
    // On plain HTTP with a LAN IP it will be undefined.
    if (!window.crypto?.subtle) {
      setErrorMsg(
        "Encryption requires a secure context (HTTPS). " +
        "Run the dev server with HTTPS or access via localhost."
      );
      setStatus("error");
      return;
    }

    const hash = window.location.hash;
    if (!hash) {
      setErrorMsg("No encryption key found in URL. Please use a valid room link.");
      setStatus("error");
      return;
    }
    importKeyFromHash(hash).then((k) => {
      keyRef.current = k;
    }).catch(() => {
      setErrorMsg("Invalid encryption key in URL.");
      setStatus("error");
    });
  }, []);

  const setupPeer = useCallback(async (isInitiator: boolean) => {
    if (!roomId) return;
    setStatus("connecting");

    const signaling = new SignalingChannel(roomId);
    signalingRef.current = signaling;
    await signaling.connect();

    const peer = new SimplePeer({
      initiator: isInitiator,
      trickle: true,
      config: {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" },
        ],
      },
    });
    peerRef.current = peer;

    peer.on("signal", async (data) => {
      const type = data.type === "offer" ? "offer" : data.type === "answer" ? "answer" : "ice";
      await signaling.send(type, data);
    });

    signaling.onSignal((msg) => {
      if (msg.type === "offer" || msg.type === "answer" || msg.type === "ice") {
        peer.signal(msg.payload);
      }
      if (msg.type === "join" && isInitiator) setStatus("connecting");
    });

    peer.on("connect", () => setStatus("connected"));
    peer.on("error", (err) => {
      console.error("[peer] error:", err);
      setErrorMsg(`Connection error: ${err.message}`);
      setStatus("error");
    });
    peer.on("close", () => setStatus("idle"));

    return peer;
  }, [roomId]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    if (!roleSetRef.current) {
      roleSetRef.current = true;
      setRole("sender");
      setStatus("waiting");
    }
  }

  async function startTransfer(peer: SimplePeer.Instance, file: File) {
    if (!keyRef.current) return;
    const key = keyRef.current;
    setStatus("transferring");

    const header: FileHeader = { name: file.name, size: file.size, type: file.type };
    peer.send(JSON.stringify({ __header: header }));

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    let chunkIndex = 0;
    const reader = file.stream().getReader();

    const processChunk = async (value: Uint8Array) => {
      const encrypted = await encryptChunk(key, value);
      peer.send(encrypted);
      chunkIndex++;
      setProgress(Math.round((chunkIndex / totalChunks) * 100));
    };

    let done = false;
    let buffer = new Uint8Array(0);
    while (!done) {
      const { value, done: streamDone } = await reader.read();
      done = streamDone;
      if (value) {
        const combined = new Uint8Array(buffer.length + value.length);
        combined.set(buffer);
        combined.set(value, buffer.length);
        buffer = combined;
        while (buffer.length >= CHUNK_SIZE) {
          await processChunk(buffer.slice(0, CHUNK_SIZE));
          buffer = buffer.slice(CHUNK_SIZE);
        }
      }
    }
    if (buffer.length > 0) await processChunk(buffer);
    peer.send(JSON.stringify({ __done: true }));
    setStatus("done");
  }

  useEffect(() => {
    if (status !== "connected" || role !== "sender" || !selectedFile) return;
    const peer = peerRef.current;
    if (!peer) return;
    startTransfer(peer, selectedFile);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, role, selectedFile]);

  function setupReceiverDataHandler(peer: SimplePeer.Instance) {
    peer.on("data", async (rawData: Uint8Array | string) => {
      try {
        const str = typeof rawData === "string" ? rawData : new TextDecoder().decode(rawData);
        const parsed = JSON.parse(str);

        if (parsed.__header) {
          setFileHeader(parsed.__header as FileHeader);
          setStatus("transferring");
          return;
        }
        if (parsed.__done) {
          const blob = new Blob(receivedChunksRef.current.map((c) => c.buffer as ArrayBuffer), {
            type: fileHeader?.type ?? "application/octet-stream",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileHeader?.name ?? "download";
          a.click();
          URL.revokeObjectURL(url);
          setProgress(100);
          setStatus("done");
          return;
        }
      } catch { /* binary chunk */ }

      if (!keyRef.current) return;
      const bytes = typeof rawData === "string" ? new TextEncoder().encode(rawData) : rawData;
      try {
        const decrypted = await decryptChunk(keyRef.current, bytes);
        receivedChunksRef.current.push(decrypted);
        receivedSizeRef.current += decrypted.length;
        if (fileHeader) {
          setProgress(Math.min(100, Math.round((receivedSizeRef.current / fileHeader.size) * 100)));
        }
      } catch (err) {
        console.error("[decrypt] failed:", err);
        setErrorMsg("Decryption failed. The file may be corrupted.");
        setStatus("error");
      }
    });
  }

  async function becomeReceiver() {
    roleSetRef.current = true;
    setRole("receiver");
    setStatus("waiting");
    const peer = await setupPeer(false);
    if (peer) setupReceiverDataHandler(peer);
  }

  useEffect(() => {
    if (role !== "sender" || peerRef.current) return;
    setupPeer(true).then((peer) => {
      if (!peer) return;
      peer.on("connect", () => setStatus("connected"));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  function copyLink() {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const statusLabel: Record<Status, string> = {
    idle: "Ready",
    waiting: "Waiting for the other peer...",
    connecting: "Connecting...",
    connected: "Connected",
    transferring: "Transferring...",
    done: "Done",
    error: "Error",
  };

  return (
    <main className="min-h-screen bg-surface flex flex-col items-center justify-center px-4 py-16 animate-fade-in">
      {/* Header */}
      <div className="mb-10 w-full max-w-lg flex items-center justify-between">
        <div>
          <a href="/" className="text-2xl font-extrabold text-fg tracking-tight">Pear</a>
          <p className="text-sm text-fg-muted mt-0.5">Encrypted file transfer</p>
        </div>
        <ThemeToggle />
      </div>

      <div className="w-full max-w-lg">
        {/* Error state */}
        {status === "error" && (
          <div className="rounded-2xl bg-red-500/10 border border-red-500/30 p-6 text-center mb-6">
            <p className="text-red-500 font-semibold">{errorMsg}</p>
            <a href="/" className="text-sm text-pear-green mt-3 inline-block hover:underline">Go home</a>
          </div>
        )}

        {/* Role selection */}
        {role === "unknown" && status !== "error" && (
          <div className="rounded-2xl bg-card border border-border-pear p-8 text-center shadow-sm">
            <h2 className="text-2xl font-bold text-fg mb-2">File Transfer Room</h2>
            <p className="text-fg-muted text-sm mb-8">Are you sending or receiving a file?</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <label className="flex-1 cursor-pointer px-6 py-4 rounded-2xl bg-pear-green text-white font-bold text-center hover:bg-pear-green-dark transition-colors active:scale-95">
                Send a File
                <input type="file" className="hidden" onChange={handleFileSelect} />
              </label>
              <button
                onClick={becomeReceiver}
                className="flex-1 px-6 py-4 rounded-2xl bg-card text-fg font-bold border-2 border-border-pear hover:border-pear-green hover:bg-pear-green/5 transition-colors active:scale-95"
              >
                Receive a File
              </button>
            </div>
          </div>
        )}

        {/* Sender view */}
        {role === "sender" && (
          <div className="rounded-2xl bg-card border border-border-pear p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-fg mb-1">Send</h2>
            <p className="text-fg-muted text-sm mb-6">
              Share this link with the receiver. The encryption key is in the URL hash.
            </p>
            <div className="flex items-center gap-2 mb-6">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 text-xs font-mono bg-subtle border border-border-pear rounded-xl px-3 py-2 truncate text-fg"
              />
              <button
                onClick={copyLink}
                className="shrink-0 px-4 py-2 rounded-xl bg-pear-green text-white text-sm font-bold hover:bg-pear-green-dark transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            {selectedFile && (
              <div className="text-sm text-fg-muted mb-4">
                <span className="font-semibold text-fg">{selectedFile.name}</span>
                {" "}&mdash; {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
              </div>
            )}
            <StatusBar status={status} progress={progress} statusLabel={statusLabel} />
          </div>
        )}

        {/* Receiver view */}
        {role === "receiver" && (
          <div className="rounded-2xl bg-card border border-border-pear p-8 shadow-sm">
            <h2 className="text-2xl font-bold text-fg mb-1">Receive</h2>
            <p className="text-fg-muted text-sm mb-6">
              Waiting for the sender to connect and start the transfer.
            </p>
            {fileHeader && (
              <div className="text-sm text-fg-muted mb-4">
                Incoming: <span className="font-semibold text-fg">{fileHeader.name}</span>
                {" "}&mdash; {(fileHeader.size / 1024 / 1024).toFixed(2)} MB
              </div>
            )}
            <StatusBar status={status} progress={progress} statusLabel={statusLabel} />
            {status === "done" && (
              <p className="text-center text-pear-green font-bold mt-4">Download started automatically.</p>
            )}
          </div>
        )}
      </div>

      <p className="mt-8 text-xs text-fg-muted/60 text-center max-w-sm">
        All data is encrypted with AES-256-GCM in your browser.
        The key never leaves your device via the server.
      </p>
    </main>
  );
}

function StatusBar({
  status, progress, statusLabel,
}: {
  status: Status;
  progress: number;
  statusLabel: Record<Status, string>;
}) {
  return (
    <div>
      <div className="flex justify-between text-xs text-fg-muted mb-2">
        <span className={status === "waiting" || status === "connecting" ? "animate-pulse-soft" : ""}>
          {statusLabel[status]}
        </span>
        {(status === "transferring" || status === "done") && <span>{progress}%</span>}
      </div>
      <div className="h-2 rounded-full bg-pear-green/15 overflow-hidden">
        <div
          className="h-full bg-pear-green rounded-full transition-all duration-300 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
