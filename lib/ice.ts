/**
 * Pear ICE Configuration
 *
 * WebRTC needs ICE servers to establish peer-to-peer connections.
 * - STUN: Discovers the peer's public IP/port (works for ~80% of NATs)
 * - TURN: Relays traffic when direct P2P fails (symmetric NAT, firewalls, etc.)
 *
 * Without TURN, connections between devices on different networks will often
 * fail silently — both sides show "Connecting..." forever.
 *
 * Configure your own TURN server via environment variables for production use.
 * Free tiers: Metered.ca, Twilio, Xirsys all offer free TURN allocations.
 */

export interface IceConfig {
  iceServers: RTCIceServer[];
}

/**
 * Build the ICE servers list from environment variables.
 * Falls back to public STUN servers if no TURN is configured.
 */
export function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    // Public STUN servers (free, no auth needed)
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ];

  // TURN server from environment (recommended for cross-network connections)
  const turnUrl = process.env.TURN_SERVER_URL;
  const turnUser = process.env.TURN_USERNAME;
  const turnCred = process.env.TURN_CREDENTIAL;

  if (turnUrl && turnUser && turnCred) {
    // Add all TURN variants for maximum compatibility
    const urls = turnUrl.split(",").map((u) => u.trim());
    servers.push({
      urls,
      username: turnUser,
      credential: turnCred,
    });
  } else {
    // Fallback: free Open Relay TURN servers (metered.ca open relay project)
    // These are free, publicly available TURN servers for testing/small projects.
    // For production with heavy traffic, use your own TURN server.
    servers.push(
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turns:openrelay.metered.ca:443?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    );
  }

  return servers;
}
