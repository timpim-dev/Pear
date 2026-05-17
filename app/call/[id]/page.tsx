"use client";

/**
 * Video Call Room — /call/[id]
 *
 * How it works:
 *   1. Both peers navigate to /call/[id]#key
 *   2. The first peer (initiator) gets their local stream (camera + mic)
 *      and creates a simple-peer instance with initiator: true.
 *   3. The second peer (responder) does the same but with initiator: false.
 *   4. simple-peer handles the full WebRTC negotiation: offer, answer, ICE.
 *   5. Video/audio streams flow P2P via WebRTC — the server is never involved.
 *
 * Screen sharing:
 *   getDisplayMedia() replaces the video track sent to the remote peer.
 *   The local video preview also switches to the screen share feed.
 *
 * The URL hash key is used for room identification context only in this page.
 * (Video streams are already E2E encrypted by WebRTC's DTLS-SRTP.)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import SimplePeer from "simple-peer";
import { SignalingChannel } from "@/lib/signaling";

type CallStatus = "idle" | "waiting" | "connecting" | "connected" | "ended" | "error";

export default function CallPage() {
  const params = useParams();
  const roomId = params.id as string;

  const [status, setStatus] = useState<CallStatus>("idle");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<SimplePeer.Instance | null>(null);
  const signalingRef = useRef<SignalingChannel | null>(null);
  const isInitiatorRef = useRef(false);
  const joinedRef = useRef(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setShareUrl(window.location.href);
    }
  }, []);

  const startCall = useCallback(async (isInitiator: boolean) => {
    if (joinedRef.current) return;
    joinedRef.current = true;
    isInitiatorRef.current = isInitiator;

    setStatus("waiting");

    try {
      // Request camera and microphone access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: true,
      });
      localStreamRef.current = stream;

      // Show local preview (muted to avoid feedback)
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // Connect to Ably signaling
      const signaling = new SignalingChannel(roomId);
      signalingRef.current = signaling;
      await signaling.connect();

      // Create simple-peer with the local media stream
      const peer = new SimplePeer({
        initiator: isInitiator,
        stream,
        trickle: true,
        config: {
          iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
          ],
        },
      });
      peerRef.current = peer;

      // Relay our WebRTC signals via Ably
      peer.on("signal", async (data) => {
        const type = data.type === "offer" ? "offer"
          : data.type === "answer" ? "answer"
          : "ice";
        await signaling.send(type, data);
      });

      // Feed incoming Ably signals into simple-peer
      signaling.onSignal((msg) => {
        if (msg.type === "offer" || msg.type === "answer" || msg.type === "ice") {
          peer.signal(msg.payload);
        }
        if (msg.type === "join" && isInitiator) {
          setStatus("connecting");
        }
      });

      // When the P2P connection is established
      peer.on("connect", () => {
        setStatus("connected");
      });

      // When we receive the remote peer's stream — attach to video element
      peer.on("stream", (remoteStream: MediaStream) => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
        setStatus("connected");
      });

      peer.on("error", (err) => {
        console.error("[peer] call error:", err);
        setErrorMsg(`Connection error: ${err.message}`);
        setStatus("error");
      });

      peer.on("close", () => {
        setStatus("ended");
        cleanup();
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Permission denied") || msg.includes("NotAllowed")) {
        setErrorMsg("Camera/mic access denied. Please allow permissions and try again.");
      } else {
        setErrorMsg(`Failed to start call: ${msg}`);
      }
      setStatus("error");
    }
  }, [roomId]);

  function cleanup() {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    peerRef.current?.destroy();
    signalingRef.current?.disconnect();
    localStreamRef.current = null;
    screenStreamRef.current = null;
    peerRef.current = null;
  }

  // Mute/unmute microphone
  function toggleMute() {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => {
      t.enabled = isMuted; // flip: if currently muted, enable
    });
    setIsMuted(!isMuted);
  }

  // Camera on/off
  function toggleCamera() {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => {
      t.enabled = isCameraOff; // flip
    });
    setIsCameraOff(!isCameraOff);
  }

  // Screen share: replace the video track being sent to the remote peer
  async function toggleScreenShare() {
    const peer = peerRef.current;
    if (!peer) return;

    if (isScreenSharing) {
      // Stop screen share and revert to camera
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      screenStreamRef.current = null;

      const cameraStream = localStreamRef.current;
      if (cameraStream) {
        const cameraTrack = cameraStream.getVideoTracks()[0];
        if (cameraTrack) {
          // Replace the screen track with the camera track in the peer connection
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (peer as any).replaceTrack(
            peer.streams[0]?.getVideoTracks()[0],
            cameraTrack,
            localStreamRef.current!
          );
        }
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = cameraStream;
        }
      }
      setIsScreenSharing(false);
    } else {
      try {
        // Capture the screen
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        });
        screenStreamRef.current = screenStream;

        const screenTrack = screenStream.getVideoTracks()[0];

        // Replace camera track in the peer connection with the screen track
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (peer as any).replaceTrack(
          peer.streams[0]?.getVideoTracks()[0],
          screenTrack,
          localStreamRef.current!
        );

        // Show screen in local preview
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = screenStream;
        }

        // When user stops sharing via browser UI, revert automatically
        screenTrack.onended = () => {
          setIsScreenSharing(false);
          if (localVideoRef.current && localStreamRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
          }
        };

        setIsScreenSharing(true);
      } catch (err) {
        console.error("[screen share] failed:", err);
      }
    }
  }

  function endCall() {
    cleanup();
    setStatus("ended");
  }

  function copyLink() {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <main className="min-h-screen bg-pear-dark flex flex-col items-center justify-center relative overflow-hidden">
      {/* Pre-call overlay */}
      {status === "idle" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-pear-dark z-20 animate-fade-in px-4">
          <a href="/" className="text-2xl font-extrabold text-white tracking-tight mb-2">
            Pear
          </a>
          <p className="text-pear-green/70 text-sm mb-10">Encrypted video call</p>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-8 w-full max-w-md text-center">
            <h2 className="text-xl font-bold text-white mb-2">Ready to call?</h2>
            <p className="text-white/50 text-sm mb-6">
              Share the link with your contact, then join the call.
            </p>

            {/* Share link */}
            <div className="flex items-center gap-2 mb-6">
              <input
                readOnly
                value={shareUrl}
                className="flex-1 text-xs font-mono bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-white/70 truncate"
              />
              <button
                onClick={copyLink}
                className="shrink-0 px-4 py-2 rounded-xl bg-pear-green text-white text-sm font-bold hover:bg-pear-green-dark transition-colors"
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => startCall(true)}
                className="flex-1 py-3 rounded-2xl bg-pear-green text-white font-bold hover:bg-pear-green-dark transition-colors active:scale-95"
              >
                Start Call (Host)
              </button>
              <button
                onClick={() => startCall(false)}
                className="flex-1 py-3 rounded-2xl bg-white/10 text-white font-bold border border-white/15 hover:bg-white/15 transition-colors active:scale-95"
              >
                Join Call
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error overlay */}
      {status === "error" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-pear-dark z-20 px-4">
          <div className="bg-red-900/30 border border-red-500/30 rounded-2xl p-8 max-w-md text-center">
            <p className="text-red-300 font-semibold mb-4">{errorMsg}</p>
            <a href="/" className="text-pear-green hover:underline text-sm">
              Go home
            </a>
          </div>
        </div>
      )}

      {/* Call ended overlay */}
      {status === "ended" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-pear-dark z-20">
          <p className="text-white text-xl font-bold mb-4">Call ended</p>
          <a
            href="/"
            className="px-6 py-3 rounded-2xl bg-pear-green text-white font-bold hover:bg-pear-green-dark transition-colors"
          >
            Go home
          </a>
        </div>
      )}

      {/* Video grid */}
      <div className="w-full h-screen flex items-center justify-center relative">
        {/* Remote video — large, full area */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover bg-black"
        />

        {/* Waiting state shown over remote video */}
        {(status === "waiting" || status === "connecting") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-pear-dark/80">
            <div className="w-3 h-3 rounded-full bg-pear-green animate-pulse-soft mb-3" />
            <p className="text-white/70 text-sm">
              {status === "waiting" ? "Waiting for the other person..." : "Connecting..."}
            </p>
          </div>
        )}

        {/* Local video — picture-in-picture style */}
        <div className="absolute bottom-24 right-4 sm:right-6 w-36 sm:w-44 aspect-video rounded-2xl overflow-hidden border-2 border-white/20 shadow-xl bg-pear-dark">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          {isCameraOff && (
            <div className="absolute inset-0 bg-pear-dark/90 flex items-center justify-center">
              <span className="text-white/50 text-xs">Camera off</span>
            </div>
          )}
        </div>
      </div>

      {/* Controls bar — visible once in call */}
      {(status === "waiting" || status === "connecting" || status === "connected") && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-pear-dark/80 backdrop-blur-sm border border-white/10 rounded-2xl px-5 py-3 shadow-xl z-10">
          {/* Mute */}
          <ControlButton
            label={isMuted ? "Unmute" : "Mute"}
            active={isMuted}
            onClick={toggleMute}
            icon={isMuted ? <MicOffIcon /> : <MicIcon />}
          />

          {/* Camera */}
          <ControlButton
            label={isCameraOff ? "Show Camera" : "Hide Camera"}
            active={isCameraOff}
            onClick={toggleCamera}
            icon={isCameraOff ? <CameraOffIcon /> : <CameraIcon />}
          />

          {/* Screen share */}
          <ControlButton
            label={isScreenSharing ? "Stop Share" : "Share Screen"}
            active={isScreenSharing}
            onClick={toggleScreenShare}
            icon={<ScreenIcon />}
          />

          {/* End call */}
          <button
            onClick={endCall}
            title="End call"
            className="w-12 h-12 rounded-full bg-red-500 hover:bg-red-600 active:scale-90 transition-all flex items-center justify-center text-white"
          >
            <PhoneOffIcon />
          </button>
        </div>
      )}

      {/* Screen share label */}
      {isScreenSharing && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-pear-green/90 text-white text-xs font-bold px-4 py-1.5 rounded-full shadow">
          Sharing your screen
        </div>
      )}
    </main>
  );
}

// --- Control button component ---
function ControlButton({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`
        w-12 h-12 rounded-full flex items-center justify-center transition-all active:scale-90
        ${active
          ? "bg-white/20 text-white ring-2 ring-white/40"
          : "bg-white/10 text-white/80 hover:bg-white/20"}
      `}
    >
      {icon}
    </button>
  );
}

// --- Minimal SVG icons ---
function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <rect x="9" y="2" width="6" height="13" rx="3" />
      <path d="M5 10a7 7 0 0014 0M12 19v4M8 23h8" strokeLinecap="round" />
    </svg>
  );
}

function MicOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <line x1="2" y1="2" x2="22" y2="22" strokeLinecap="round" />
      <path d="M10.7 10.7A3 3 0 009 13v0a7 7 0 0010 0M9 2a3 3 0 016 0v6M12 19v4M8 23h8" strokeLinecap="round" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path d="M23 7l-7 5 7 5V7z" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  );
}

function CameraOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <path d="M16 16.7V19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h1M23 7l-7 5 7 5V7z" />
      <line x1="2" y1="2" x2="22" y2="22" strokeLinecap="round" />
    </svg>
  );
}

function ScreenIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="w-5 h-5">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" strokeLinecap="round" />
    </svg>
  );
}

function PhoneOffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="w-5 h-5">
      <path d="M10.68 13.31a16 16 0 003.01 3.02l2.25-2.26a.88.88 0 01.98-.18 10 10 0 004.07.82.9.9 0 01.9.9v4.07a.9.9 0 01-.9.9A19 19 0 012.1 5.1a.9.9 0 01.9-.9h4.08a.9.9 0 01.9.9 10 10 0 00.82 4.07.88.88 0 01-.18.98L6.37 12.4M2 2l20 20" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
