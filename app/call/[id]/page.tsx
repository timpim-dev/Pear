"use client";

/**
 * Video Call Room — /call/[id]
 *
 * Code-based room system:
 *   1. Both peers navigate to /call/CODE (same 6-char room code)
 *   2. The first peer to arrive becomes the initiator automatically
 *   3. When the second peer joins, signaling negotiates the WebRTC connection
 *   4. Video/audio streams flow P2P via WebRTC — the server is never involved
 *
 * Screen sharing:
 *   getDisplayMedia() replaces the video track sent to the remote peer.
 *   The local video preview also switches to the screen share feed.
 *
 * (Video streams are already E2E encrypted by WebRTC's DTLS-SRTP.)
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import SimplePeer from "simple-peer";
import { SignalingChannel } from "@/lib/signaling";
import { ThemeToggle } from "@/components/ThemeToggle";

type CallStatus = "setup" | "waiting" | "connecting" | "connected" | "ended" | "error";

export default function CallPage() {
  const params = useParams();
  const roomCode = (params.id as string).toUpperCase();

  const [status, setStatus] = useState<CallStatus>("setup");
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // Device selection
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [selectedAudioId, setSelectedAudioId] = useState("");

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<SimplePeer.Instance | null>(null);
  const signalingRef = useRef<SignalingChannel | null>(null);
  const isInitiatorRef = useRef(false);
  const pendingSignalsRef = useRef<unknown[]>([]);
  const setupDoneRef = useRef(false);
  // ICE servers (STUN + TURN) fetched from /api/ice
  const iceServersRef = useRef<RTCIceServer[]>([
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ]);

  // Stop preview stream on unmount
  useEffect(() => {
    return () => {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // Auto-start camera preview on mount + fetch ICE servers
  useEffect(() => {
    if (!setupDoneRef.current) {
      setupDoneRef.current = true;
      startPreview();

      // Fetch ICE servers (STUN + TURN) for WebRTC
      fetch("/api/ice")
        .then((r) => r.json())
        .then((data) => {
          if (data.iceServers) iceServersRef.current = data.iceServers;
        })
        .catch((err) => console.warn("[ice] Failed to fetch ICE config, using defaults:", err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Device enumeration ─────────────────────────────────────────────────────

  const enumerateDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setVideoDevices(devices.filter((d) => d.kind === "videoinput"));
      setAudioDevices(devices.filter((d) => d.kind === "audioinput"));
    } catch (err) {
      console.error("Failed to enumerate devices:", err);
    }
  }, []);

  // ─── Preview stream (pre-call) ──────────────────────────────────────────────

  const startPreview = useCallback(
    async (videoId?: string, audioId?: string) => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorMsg(
          "Camera/mic access requires a secure context (HTTPS). " +
            "Run the dev server with HTTPS or access via localhost."
        );
        setStatus("error");
        return;
      }

      try {
        // Stop existing preview
        localStreamRef.current?.getTracks().forEach((t) => t.stop());

        const stream = await navigator.mediaDevices.getUserMedia({
          video: videoId
            ? { deviceId: { exact: videoId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: audioId ? { deviceId: { exact: audioId } } : true,
        });
        localStreamRef.current = stream;

        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = stream;
        }

        // After permission granted, enumerate to get real device labels
        await enumerateDevices();

        // Auto-select whatever device the browser picked
        if (!videoId) {
          const vTrack = stream.getVideoTracks()[0];
          if (vTrack) setSelectedVideoId(vTrack.getSettings().deviceId || "");
        }
        if (!audioId) {
          const aTrack = stream.getAudioTracks()[0];
          if (aTrack) setSelectedAudioId(aTrack.getSettings().deviceId || "");
        }

        setStatus("setup");
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("Permission denied") || msg.includes("NotAllowed")) {
          setErrorMsg("Camera/mic access denied. Please allow permissions and try again.");
        } else {
          setErrorMsg(`Failed to access camera: ${msg}`);
        }
        setStatus("error");
      }
    },
    [enumerateDevices]
  );

  // When user changes camera/mic in the dropdowns, restart preview
  function handleVideoChange(deviceId: string) {
    setSelectedVideoId(deviceId);
    startPreview(deviceId, selectedAudioId || undefined);
  }
  function handleAudioChange(deviceId: string) {
    setSelectedAudioId(deviceId);
    startPreview(selectedVideoId || undefined, deviceId);
  }

  // ─── Create a SimplePeer and wire it up ─────────────────────────────────────

  function createPeer(
    stream: MediaStream,
    signaling: SignalingChannel,
    isInitiator: boolean
  ): SimplePeer.Instance {
    const peer = new SimplePeer({
      initiator: isInitiator,
      stream,
      trickle: true,
      config: {
        iceServers: iceServersRef.current,
      },
    });
    peerRef.current = peer;

    // Relay our WebRTC signals via Ably
    peer.on("signal", async (data) => {
      const type =
        data.type === "offer" ? "offer" : data.type === "answer" ? "answer" : "ice";
      await signaling.send(type, data);
    });

    // When the P2P connection is established
    peer.on("connect", () => setStatus("connected"));

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

    // Feed any signals that arrived before the peer was created
    for (const sig of pendingSignalsRef.current) {
      peer.signal(sig as SimplePeer.SignalData);
    }
    pendingSignalsRef.current = [];

    return peer;
  }

  // ─── Join the room (auto-negotiate initiator) ──────────────────────────────

  const joinRoom = useCallback(
    async () => {
      setStatus("waiting");

      const stream = localStreamRef.current;
      if (!stream) {
        setErrorMsg("No camera stream available.");
        setStatus("error");
        return;
      }

      // Show local preview in the call view
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      try {
        const signaling = new SignalingChannel(roomCode);
        signalingRef.current = signaling;

        // Register signal handlers BEFORE connecting so we don't miss
        // the other peer's "join" or any signals that arrive immediately.
        signaling.onSignal((msg) => {
          if (msg.type === "join") {
            // Another peer joined — we were here first, so we're the initiator.
            // Send "ready" back so the new peer knows to become the responder.
            if (!peerRef.current) {
              isInitiatorRef.current = true;
              setStatus("connecting");
              createPeer(stream, signaling, true);
              signaling.send("ready", { peerId: signaling.id });
            }
          }
          if (msg.type === "ready") {
            // The other peer is already waiting and will initiate.
            // We become the responder.
            if (!peerRef.current) {
              isInitiatorRef.current = false;
              setStatus("connecting");
              createPeer(stream, signaling, false);
            }
          }
          if (msg.type === "offer" || msg.type === "answer" || msg.type === "ice") {
            if (peerRef.current) {
              peerRef.current.signal(msg.payload);
            } else {
              // Buffer signals that arrive before peer is created
              pendingSignalsRef.current.push(msg.payload);
            }
          }
        });

        await signaling.connect();

        // After connecting, announce we're ready.
        // If someone else is already in the room, they'll see our "join" and initiate.
        // If we're first, we'll wait and see their "join" later.
        await signaling.send("ready", { peerId: signaling.id });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setErrorMsg(`Failed to join room: ${msg}`);
        setStatus("error");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roomCode]
  );

  // ─── Cleanup ────────────────────────────────────────────────────────────────

  function cleanup() {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    peerRef.current?.destroy();
    signalingRef.current?.disconnect();
    localStreamRef.current = null;
    screenStreamRef.current = null;
    peerRef.current = null;
  }

  // ─── In-call controls ──────────────────────────────────────────────────────

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

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-pear-dark flex flex-col items-center justify-center relative overflow-hidden">
      {/* Setup overlay — camera preview + device selection + room code display */}
      {status === "setup" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-pear-dark z-20 animate-fade-in px-4">
          <div className="flex items-center gap-3 mb-2">
            <a href="/" className="text-2xl font-extrabold text-white tracking-tight">
              Pear
            </a>
            <ThemeToggle />
          </div>
          <p className="text-pear-green/70 text-sm mb-6">Check your camera &amp; mic</p>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-6 w-full max-w-lg">
            {/* Room code badge */}
            <div className="flex items-center justify-center gap-2 mb-5">
              <span className="text-white/40 text-xs font-semibold uppercase tracking-wider">Room</span>
              <div className="flex items-center gap-0.5">
                {roomCode.split("").map((char, i) => (
                  <span
                    key={i}
                    className="w-8 h-10 flex items-center justify-center rounded-lg bg-white/10 border border-white/10 text-lg font-extrabold text-pear-green font-mono"
                  >
                    {char}
                  </span>
                ))}
              </div>
            </div>

            {/* Camera preview */}
            <div className="relative aspect-video rounded-xl overflow-hidden bg-black mb-5">
              <video
                ref={previewVideoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
            </div>

            {/* Device selectors */}
            <div className="space-y-3 mb-6">
              {/* Camera */}
              <div>
                <label className="text-white/60 text-xs font-semibold block mb-1">Camera</label>
                <select
                  value={selectedVideoId}
                  onChange={(e) => handleVideoChange(e.target.value)}
                  className="w-full bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-sm text-white appearance-none cursor-pointer hover:bg-white/15 transition-colors"
                >
                  {videoDevices.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId} className="bg-[#1a1a1a] text-white">
                      {d.label || `Camera ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Microphone */}
              <div>
                <label className="text-white/60 text-xs font-semibold block mb-1">Microphone</label>
                <select
                  value={selectedAudioId}
                  onChange={(e) => handleAudioChange(e.target.value)}
                  className="w-full bg-white/10 border border-white/10 rounded-xl px-3 py-2 text-sm text-white appearance-none cursor-pointer hover:bg-white/15 transition-colors"
                >
                  {audioDevices.map((d, i) => (
                    <option key={d.deviceId} value={d.deviceId} className="bg-[#1a1a1a] text-white">
                      {d.label || `Microphone ${i + 1}`}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Join button */}
            <button
              onClick={joinRoom}
              className="w-full py-3 rounded-2xl bg-pear-green text-white font-bold text-lg hover:bg-pear-green-dark transition-colors active:scale-95"
            >
              Join Room
            </button>
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
            {/* Room code display */}
            <div className="flex items-center gap-2 mb-6">
              <span className="text-white/40 text-xs font-semibold uppercase tracking-wider">Room</span>
              <div className="flex items-center gap-0.5">
                {roomCode.split("").map((char, i) => (
                  <span
                    key={i}
                    className="w-8 h-10 flex items-center justify-center rounded-lg bg-white/10 border border-white/10 text-lg font-extrabold text-pear-green font-mono"
                  >
                    {char}
                  </span>
                ))}
              </div>
            </div>
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
