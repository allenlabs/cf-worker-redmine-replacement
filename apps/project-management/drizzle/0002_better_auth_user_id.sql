-- Add link to allenlabs-auth Better Auth user id. The auth.allen.company
-- SSO redirect flow lands here at /auth/callback with a code, which we
-- exchange for a JWT against auth-api.allen.company. The JWT's `sub`
-- claim is a Better Auth UUID; we store it here to map back to the local
-- integer-keyed users row on every subsequent request (find-or-create on
-- first sign-in).
--
-- Local password_hash / password_salt / github_id stay for now to allow
-- a clean transition (no orphan rows on existing data); they're scheduled
-- for removal in a follow-up migration once every user has signed in via
-- the new flow at least once.

ALTER TABLE users ADD COLUMN better_auth_user_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_better_auth_user_id_idx
  ON users (better_auth_user_id);
