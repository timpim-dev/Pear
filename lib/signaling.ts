/**
 * Pear Signaling Client
 *
 * Wraps the Ably Realtime SDK to provide a simple event emitter interface
 * for WebRTC signaling (offer, answer, ICE candidates).
 *
 * Flow:
 *   1. Browser requests a scoped Ably token from GET /api/signal?roomId=xxx
 *   2. Browser subscribes to the Ably channel `pear:signal:{roomId}`
 *   3. To send a signal, browser POSTs to /api/signal (server publishes via REST)
 *      OR publishes directly via the realtime channel (faster, used here)
 *
 * The server is only needed for token generation.
 * All signaling messages are tiny (< 10 KB) — offers/answers/ICE SDP strings.
 */

import Ably from "ably";

export type SignalType = "offer" | "answer" | "ice" | "join" | "ready";

export interface SignalMessage {
  type: SignalType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any;
  from?: string;
}

type SignalHandler = (msg: SignalMessage) => void;

export class SignalingChannel {
  private client: Ably.Realtime | null = null;
  private channel: Ably.RealtimeChannel | null = null;
  private handlers: SignalHandler[] = [];
  private peerId: string;

  constructor(private roomId: string) {
    // Unique ID for this browser tab — helps distinguish peers in a room
    this.peerId = Math.random().toString(36).slice(2, 10);
  }

  /** Connect to Ably and subscribe to the room channel. */
  async connect(): Promise<void> {
    // Fetch a scoped token from our API (avoids exposing the full API key)
    const res = await fetch(`/api/signal?roomId=${encodeURIComponent(this.roomId)}`);
    if (!res.ok) throw new Error("Failed to get Ably token");
    const tokenRequest = await res.json();

    this.client = new Ably.Realtime({ authCallback: (_data, callback) => {
      callback(null, tokenRequest);
    }});

    await new Promise<void>((resolve, reject) => {
      this.client!.connection.once("connected", () => resolve());
      this.client!.connection.once("failed", () => reject(new Error("Ably connection failed")));
    });

    this.channel = this.client.channels.get(`pear:signal:${this.roomId}`);

    // Subscribe to all message types on this channel
    this.channel.subscribe((msg) => {
      const signal = msg.data as SignalMessage;
      // Don't echo our own messages back
      if (signal?.from === this.peerId) return;
      this.handlers.forEach((h) => h(signal));
    });

    // Announce our presence to the other peer
    await this.send("join", { peerId: this.peerId });
  }

  /** Publish a signal to the room channel. */
  async send(type: SignalType, payload: unknown): Promise<void> {
    if (!this.channel) throw new Error("Not connected");
    await this.channel.publish(type, {
      type,
      payload,
      from: this.peerId,
    } satisfies SignalMessage);
  }

  /** Register a handler for incoming signals. */
  onSignal(handler: SignalHandler): void {
    this.handlers.push(handler);
  }

  /** Remove a handler. */
  offSignal(handler: SignalHandler): void {
    this.handlers = this.handlers.filter((h) => h !== handler);
  }

  /** Clean up the Ably connection. */
  disconnect(): void {
    this.client?.close();
    this.client = null;
    this.channel = null;
  }

  get id(): string {
    return this.peerId;
  }
}
