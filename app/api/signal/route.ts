/**
 * Signaling API Route — /api/signal
 *
 * This endpoint connects to Ably's realtime pub/sub service and acts as
 * a lightweight relay for WebRTC handshake messages (offer, answer, ICE candidates).
 *
 * Architecture:
 *   Browser A ---(HTTP POST offer)--> /api/signal ---(Ably publish)--> Browser B
 *   Browser B ---(HTTP POST answer)--> /api/signal ---(Ably publish)--> Browser A
 *
 * The server ONLY sees signaling metadata (offer/answer/ICE SDP).
 * It NEVER sees file data or video streams — those flow P2P via WebRTC.
 *
 * Each room gets its own Ably channel: `pear:signal:{roomId}`
 * Messages are typed: { type: "offer"|"answer"|"ice", payload: ... }
 */

import Ably from "ably";
import { NextRequest, NextResponse } from "next/server";

// We use the REST client here (not realtime) because API routes are stateless.
// The browser clients subscribe via the Ably realtime SDK.
function getAblyClient(): Ably.Rest {
  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) {
    throw new Error("ABLY_API_KEY environment variable is not set");
  }
  return new Ably.Rest({ key: apiKey });
}

// POST /api/signal
// Body: { roomId: string, type: "offer"|"answer"|"ice"|"join", payload: unknown }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { roomId, type, payload } = body as {
      roomId: string;
      type: string;
      payload: unknown;
    };

    if (!roomId || !type) {
      return NextResponse.json(
        { error: "roomId and type are required" },
        { status: 400 }
      );
    }

    const ably = getAblyClient();
    // Each room has a dedicated channel; all peers in the room receive the message
    const channel = ably.channels.get(`pear:signal:${roomId}`);

    await channel.publish(type, payload ?? null);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[signal] publish error:", err);
    return NextResponse.json(
      { error: "Signaling failed" },
      { status: 500 }
    );
  }
}

// GET /api/signal?roomId=xxx
// Returns a short-lived Ably token so the browser can subscribe without
// exposing the full API key on the client side.
export async function GET(req: NextRequest) {
  try {
    const roomId = req.nextUrl.searchParams.get("roomId");
    if (!roomId) {
      return NextResponse.json(
        { error: "roomId query param is required" },
        { status: 400 }
      );
    }

    const ably = getAblyClient();

    // Issue a token scoped to ONLY the channel for this room.
    // This means even if the token is leaked, it can't be used for other rooms.
    const tokenRequest = await ably.auth.createTokenRequest({
      capability: { [`pear:signal:${roomId}`]: ["subscribe", "publish"] },
      ttl: 3600 * 1000, // 1 hour in ms
    });

    return NextResponse.json(tokenRequest);
  } catch (err) {
    console.error("[signal] token error:", err);
    return NextResponse.json(
      { error: "Failed to create token" },
      { status: 500 }
    );
  }
}
