import { SignJWT, exportJWK, generateKeyPair, createLocalJWKSet } from 'jose';
import { _setJwksForTests, _clearJwksCacheForTests } from '~/server/session';
import type { Env } from '~/lib/env';
import type { SessionPayload } from '~/server/session';

/**
 * Test helpers for the JWKS-based session flow.  Mirrors what
 * auth-api.allen.company does in production: generate an RSA key, sign
 * JWTs with the private half, expose the public half via JWKS — except
 * we pre-seed PM's JWKS cache directly (no HTTP fetch) so unit tests
 * stay hermetic.
 *
 * Use:
 *
 *   beforeEach(async () => {
 *     await primeJwks(env);   // env points AUTH_API_URL at a fake host
 *   });
 *
 *   it('verifies', async () => {
 *     const token = await signTestJwt({ sub: 'beta-uuid', email: 'a@b' });
 *     ...
 *   });
 */

let cached:
  | {
      privateKey: CryptoKey;
      publicJwk: Record<string, unknown>;
      issuer: string;
    }
  | null = null;

export async function primeJwks(env: Env): Promise<void> {
  _clearJwksCacheForTests();
  if (!cached || cached.issuer !== env.AUTH_API_URL) {
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
    const publicJwk = await exportJWK(publicKey);
    publicJwk.kid = 'test-kid';
    publicJwk.alg = 'RS256';
    publicJwk.use = 'sig';
    cached = { privateKey, publicJwk, issuer: env.AUTH_API_URL };
  }
  const jwks = createLocalJWKSet({ keys: [cached.publicJwk as Parameters<typeof createLocalJWKSet>[0]['keys'][number]] });
  _setJwksForTests(env.AUTH_API_URL, jwks);
}

export async function signTestJwt(
  env: Env,
  payload: Partial<SessionPayload> & { sub: string },
  opts: { expSecondsFromNow?: number } = {},
): Promise<string> {
  if (!cached) {
    throw new Error('primeJwks(env) must be called before signTestJwt');
  }
  const exp = Math.floor(Date.now() / 1000) + (opts.expSecondsFromNow ?? 3600);
  return await new SignJWT({ ...payload, sub: payload.sub })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-kid' })
    .setIssuer(env.AUTH_API_URL)
    .setAudience(env.AUTH_API_URL)
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(cached.privateKey);
}

export function resetTestJwt(): void {
  _clearJwksCacheForTests();
  cached = null;
}
