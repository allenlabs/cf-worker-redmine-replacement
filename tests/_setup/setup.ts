import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// jsdom doesn't ship a TextEncoder polyfill that matches Node's; jose needs
// the Node one. Re-export so any test that imports it works the same way.
if (typeof globalThis.TextEncoder === 'undefined') {
  // @ts-expect-error — node:util provides matching impl
  globalThis.TextEncoder = (await import('node:util')).TextEncoder;
}
if (typeof globalThis.TextDecoder === 'undefined') {
  // @ts-expect-error — node:util provides matching impl
  globalThis.TextDecoder = (await import('node:util')).TextDecoder;
}

// WebCrypto is on globalThis in modern Node (≥19) but jsdom may shadow it.
if (typeof globalThis.crypto?.subtle === 'undefined') {
  const { webcrypto } = await import('node:crypto');
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
