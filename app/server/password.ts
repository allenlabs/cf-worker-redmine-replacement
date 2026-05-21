// WebCrypto-based password hashing using PBKDF2-SHA-256.
// Works on Cloudflare Workers (no Node-only deps like bcrypt).

const ITERATIONS = 210_000;
const KEY_LENGTH = 32; // bytes

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pbkdf2(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt,
      iterations: ITERATIONS,
    },
    key,
    KEY_LENGTH * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const derived = await pbkdf2(password, salt);
  return { hash: toBase64(derived), salt: toBase64(salt) };
}

export async function verifyPassword(
  password: string,
  storedHash: string | null,
  storedSalt: string | null,
): Promise<boolean> {
  if (!storedHash || !storedSalt) return false;
  const salt = fromBase64(storedSalt);
  const derived = await pbkdf2(password, salt);
  const a = toBase64(derived);
  // constant-time comparison
  if (a.length !== storedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ storedHash.charCodeAt(i);
  }
  return diff === 0;
}
