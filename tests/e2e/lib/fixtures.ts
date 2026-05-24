/**
 * Tag prefixes / constants shared by every spec.  The whole point of these
 * is to make teardown trivially correct: every test row carries one of
 * these markers, and `cleanup.ts` deletes by exact-match on those markers.
 *
 * Do NOT change a prefix without also updating cleanup.ts — otherwise the
 * cleanup script will leak rows on the next run.
 */

/** Tag stuffed into `inbox.items.tags` for every e2e-created row. */
export const INBOX_E2E_TAG = 'e2e-test';

/** Prefix on `focus.sessions.task_text` for every e2e-created session. */
export const FOCUS_E2E_PREFIX = '[e2e]';

/** Prefix on `context.snapshots.name` for every e2e-created snapshot. */
export const CONTEXT_E2E_PREFIX = 'e2e-';

/** Prefix on `pm.projects.identifier` for any e2e-created PM project. */
export const PM_E2E_PREFIX = 'e2e-';

/**
 * Prefix stuffed into `concierge.nudges.question` (and `context_summary`) for
 * every e2e-created nudge.  Concierge nudges don't have a tags column, so we
 * tag inside the LLM-composed question text itself.  cleanup.ts deletes by
 * exact prefix-match on the question column.
 */
export const CONCIERGE_E2E_PREFIX = '[e2e]';

/**
 * Build an inbox capture text with the e2e tag baked into the visible body —
 * makes failures easier to read in the deployed UI and is harmless because
 * the row is also tagged on `tags[]`.
 */
export function inboxText(label: string): string {
  return `[e2e-test] ${label}`;
}

/** Build a focus session task_text starting with [e2e]. */
export function focusTask(label: string): string {
  return `${FOCUS_E2E_PREFIX} ${label}`;
}

/** Build a context snapshot name starting with e2e-. */
export function contextName(label: string): string {
  // Snapshot names are user-visible so we slugify a bit but never strip the prefix.
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `${CONTEXT_E2E_PREFIX}${slug || 'snapshot'}`;
}

/** Apps we sign into.  Each entry maps to a per-app session cookie + base URL. */
export interface AppConfig {
  readonly name: 'inbox' | 'focus' | 'today' | 'context' | 'concierge';
  readonly baseUrl: string;
  readonly cookieName: string;
}

export const APPS: Readonly<Record<AppConfig['name'], AppConfig>> = {
  inbox: {
    name: 'inbox',
    baseUrl: 'https://inbox.allen.company',
    cookieName: 'inbox_session',
  },
  focus: {
    name: 'focus',
    baseUrl: 'https://focus.allen.company',
    cookieName: 'focus_session',
  },
  today: {
    name: 'today',
    baseUrl: 'https://today.allen.company',
    cookieName: 'today_session',
  },
  context: {
    name: 'context',
    baseUrl: 'https://context.allen.company',
    cookieName: 'context_session',
  },
  concierge: {
    name: 'concierge',
    baseUrl: 'https://concierge.allen.company',
    cookieName: 'concierge_session',
  },
};

export const AUTH_BASE_URL = 'https://auth.allen.company';
export const TEST_EMAIL_DEFAULT = 'allenlim@allenlabs.org';
