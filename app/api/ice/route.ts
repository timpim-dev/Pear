/**
 * ICE Configuration API — /api/ice
 *
 * Returns the ICE servers configuration (STUN + TURN) for WebRTC.
 * The browser fetches this before creating a SimplePeer instance.
 *
 * Why server-side?
 *   TURN credentials should not be hardcoded in the client bundle.
 *   This endpoint reads them from env vars and returns them to the browser.
 */

import { NextResponse } from "next/server";
import { getIceServers } from "@/lib/ice";

export async function GET() {
  try {
    const iceServers = getIceServers();
    return NextResponse.json({ iceServers });
  } catch (err) {
    console.error("[ice] config error:", err);
    return NextResponse.json(
      { error: "Failed to get ICE config" },
      { status: 500 }
    );
  }
}
