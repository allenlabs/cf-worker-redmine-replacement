import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '~/server/password';

describe('hashPassword / verifyPassword', () => {
  it('produces a base64 hash and salt of the expected shapes', async () => {
    const { hash, salt } = await hashPassword('hunter2');
    expect(hash).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(salt).toMatch(/^[A-Za-z0-9+/]+=*$/);
    // salt is 16 raw bytes -> 24 base64 chars (with padding)
    expect(salt.length).toBeGreaterThanOrEqual(20);
  });

  it('produces a different hash for the same password each call (random salt)', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });

  it('verifies a correct password', async () => {
    const { hash, salt } = await hashPassword('correct horse');
    expect(await verifyPassword('correct horse', hash, salt)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const { hash, salt } = await hashPassword('correct horse');
    expect(await verifyPassword('battery staple', hash, salt)).toBe(false);
  });

  it('returns false when either stored field is null', async () => {
    expect(await verifyPassword('whatever', null, 'salt')).toBe(false);
    expect(await verifyPassword('whatever', 'hash', null)).toBe(false);
    expect(await verifyPassword('whatever', null, null)).toBe(false);
  });

  it('handles unicode passwords', async () => {
    const { hash, salt } = await hashPassword('비밀번호🔒');
    expect(await verifyPassword('비밀번호🔒', hash, salt)).toBe(true);
    expect(await verifyPassword('비밀번호', hash, salt)).toBe(false);
  });

  it('rejects when stored hash length differs even if same prefix', async () => {
    const { salt } = await hashPassword('pw');
    expect(await verifyPassword('pw', 'short', salt)).toBe(false);
  });
});
