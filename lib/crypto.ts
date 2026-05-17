/**
 * Pear Crypto Utilities
 *
 * All encryption is done client-side using the Web Crypto API (SubtleCrypto).
 * Algorithm: AES-GCM with 256-bit keys.
 *
 * Why AES-GCM?
 *   - Authenticated encryption: integrity + confidentiality in one pass
 *   - Natively supported in all modern browsers via window.crypto.subtle
 *   - Each chunk gets a unique 12-byte IV (nonce) to prevent ciphertext reuse
 *
 * Key transport:
 *   The CryptoKey is derived from the URL hash (#base64url-encoded-raw-key).
 *   The hash fragment is NEVER sent in HTTP requests — it's client-only.
 */

// Chunk size for file streaming over the WebRTC DataChannel (16 KiB is reliable)
export const CHUNK_SIZE = 16 * 1024; // 16 KiB

/**
 * Parse the base64url-encoded raw key from the URL hash and
 * import it as a usable Web Crypto AES-GCM key.
 */
export async function importKeyFromHash(hash: string): Promise<CryptoKey> {
  // Strip leading '#' if present
  const b64 = hash.startsWith("#") ? hash.slice(1) : hash;

  // Restore base64 padding and convert base64url -> standard base64
  const standard = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = standard + "=".repeat((4 - (standard.length % 4)) % 4);

  const rawBytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));

  return window.crypto.subtle.importKey(
    "raw",
    rawBytes,
    { name: "AES-GCM" },
    false, // non-extractable once imported for safety
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a single chunk (Uint8Array) with AES-GCM.
 * Returns the IV prepended to the ciphertext so the receiver can extract it.
 *
 * Format: [12 bytes IV][ciphertext + 16 byte GCM tag]
 */
export async function encryptChunk(
  key: CryptoKey,
  chunk: Uint8Array
): Promise<Uint8Array> {
  // A fresh random 12-byte IV for every chunk — critical for GCM security
  const iv = window.crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    chunk.buffer as ArrayBuffer
  );

  // Prepend IV so the receiver can extract it
  const result = new Uint8Array(iv.byteLength + ciphertext.byteLength);
  result.set(iv, 0);
  result.set(new Uint8Array(ciphertext), iv.byteLength);
  return result;
}

/**
 * Decrypt a chunk that was encrypted with encryptChunk.
 * Extracts the IV from the first 12 bytes, then decrypts.
 */
export async function decryptChunk(
  key: CryptoKey,
  data: Uint8Array
): Promise<Uint8Array> {
  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);

  const plaintext = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    ciphertext
  );

  return new Uint8Array(plaintext);
}

/**
 * Generate a random room ID (URL-safe) and a fresh AES-GCM-256 key.
 * Returns a full shareable URL with the key in the hash.
 */
export async function generateRoom(
  type: "room" | "call",
  roomId: string
): Promise<string> {
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

  return `/${type}/${roomId}#${keyB64}`;
}
