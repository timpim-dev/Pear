# Pear

**Share anything. Meet anyone. Privately.**

Pear is a peer-to-peer encrypted platform for file transfer and video meetings — built with Next.js, WebRTC, and AES-GCM encryption. No accounts, no file storage, no server-side data. Everything travels directly between browsers.

---

## Architecture overview

```
Browser A  <──── WebRTC DataChannel / MediaStream ────>  Browser B
    │                                                          │
    └── HTTP POST (offer/answer/ICE) ──> /api/signal ──> Ably pub/sub ──┘
```

### Key design decisions

| Concern | Approach |
|---|---|
| **Signaling** | Ably pub/sub via a scoped token from `/api/signal`. The server sees only SDP/ICE strings — no file or video data. |
| **Encryption** | AES-GCM 256-bit, implemented with the browser's native `window.crypto.subtle` API. Each file chunk gets a fresh 12-byte IV. |
| **Key transport** | The encryption key is base64url-encoded and placed in the **URL hash** (`#key`). Hash fragments are never sent in HTTP requests, so the server is blind to the key. |
| **Video security** | WebRTC enforces DTLS-SRTP, providing built-in E2E encryption for all media streams. |
| **Identity** | No accounts, no cookies, no sessions. Room IDs are random 12-character strings generated with `nanoid`. |

### Project structure

```
app/
  page.tsx              Landing page
  room/[id]/page.tsx    File transfer room
  call/[id]/page.tsx    Video call room
  api/signal/route.ts   Signaling relay (Ably REST + token issuing)
lib/
  crypto.ts             AES-GCM encrypt/decrypt helpers
  signaling.ts          Ably realtime client wrapper
```

---

## Setup

### 1. Prerequisites

- Node.js 18+
- An Ably account (free tier is more than enough — sign up at https://ably.com)

### 2. Clone and install

```bash
git clone <your-repo>
cd pear
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and add your Ably API key:

```env
ABLY_API_KEY=your_ably_api_key_here
```

To find your API key: Ably dashboard > App > API Keys > copy the root key.

### 4. Run locally

```bash
npm run dev
```

Open http://localhost:3000.

---

## Deploying to Vercel

1. Push to a GitHub/GitLab repo.
2. Import the project at https://vercel.com/new.
3. Under **Environment Variables**, add `ABLY_API_KEY`.
4. Deploy.

Vercel's serverless functions handle `/api/signal` automatically — no additional configuration needed.

---

## How file transfer works

1. Sender clicks "Send a File" — a room ID is generated and a 256-bit AES-GCM key is created via `window.crypto.subtle.generateKey`.
2. The key is base64url-encoded and appended as the URL hash: `/room/abc123#<key>`.
3. Sender shares the URL. The receiver opens it — the key is extracted from `window.location.hash`.
4. Both peers connect via Ably signaling and establish a WebRTC `DataChannel`.
5. The sender reads the file in 16 KiB chunks, encrypts each with a unique IV using `AES-GCM`, and sends it through the DataChannel.
6. The receiver decrypts each chunk and assembles the original file, then triggers a browser download.

The server only relays `~1 KB` of SDP/ICE data. It never sees file bytes.

## How video calls work

1. Caller clicks "Start a Call" — same room/key URL pattern.
2. Both peers call `navigator.mediaDevices.getUserMedia()` to capture camera + mic.
3. `simple-peer` handles the WebRTC offer/answer exchange via the Ably signaling channel.
4. Media flows P2P over DTLS-SRTP (WebRTC's built-in E2E encryption).
5. Screen sharing replaces the video track via `getDisplayMedia()` + `peer.replaceTrack()`.

---

## Tech stack

| Package | Purpose |
|---|---|
| `next` (App Router) | Framework, routing, API routes |
| `tailwindcss` | Styling |
| `simple-peer` | WebRTC abstraction |
| `ably` | WebSocket pub/sub for signaling |
| `nanoid` | Secure random room ID generation |
| Web Crypto API | AES-GCM encryption (no library needed) |
