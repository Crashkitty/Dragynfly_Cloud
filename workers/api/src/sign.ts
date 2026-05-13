// HMAC-SHA-256 signing helpers used by /api/uploads.
// All output is URL-safe base64. Verifies in constant time.

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function b64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.byteLength; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    utf8(secret) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function signMessage(secret: string, message: string): Promise<string> {
  const key = await importHmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, utf8(message) as BufferSource);
  return b64UrlEncode(new Uint8Array(sig));
}

export async function verifyMessage(
  secret: string,
  message: string,
  providedB64Url: string,
): Promise<boolean> {
  const key = await importHmacKey(secret);
  const expected = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, utf8(message) as BufferSource),
  );
  const provided = b64UrlDecode(providedB64Url);
  return constantTimeEqual(expected, provided);
}

// SHA-256 hex digest. Used for hashing bridge bearer tokens before storage.
export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", utf8(input) as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Generate a cryptographically random URL-safe token. 32 bytes of entropy.
export function randomToken(byteLength = 32): string {
  const buf = new Uint8Array(byteLength);
  crypto.getRandomValues(buf);
  return b64UrlEncode(buf);
}
