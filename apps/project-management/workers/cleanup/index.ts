// Cron-triggered worker that deletes attachment rows + their R2 objects when
// they're older than ATTACHMENT_TTL_DAYS and orphaned (i.e. the container
// issue / wiki page / journal has been deleted).
//
// Runs daily — see workers/cleanup/wrangler.toml.  Designed to be safe to
// re-run; uses CLEANUP_MAX_ROWS to bound a single invocation.

interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  ATTACHMENT_TTL_DAYS: string;
  CLEANUP_MAX_ROWS: string;
}

interface AttachmentRow {
  id: number;
  r2_key: string;
  container_type: 'issue' | 'wiki_page' | 'project' | 'journal';
  container_id: number;
  created_at: number;
}

interface CleanupResult {
  scanned: number;
  deleted: number;
  freedBytes: number;
  durationMs: number;
}

export async function runCleanup(env: Env, now = new Date()): Promise<CleanupResult> {
  const started = Date.now();
  const ttlDays = Number(env.ATTACHMENT_TTL_DAYS || '365');
  const maxRows = Number(env.CLEANUP_MAX_ROWS || '500');
  const cutoff = Math.floor(now.getTime() / 1000) - ttlDays * 86_400;

  // Candidate set: attachments older than cutoff whose container row no
  // longer exists in the parent table.  We do this as a single SQL with
  // LEFT JOINs so a deleted container surfaces as a NULL.
  const candidates = await env.DB.prepare(
    `SELECT a.id, a.r2_key, a.container_type, a.container_id, a.created_at, a.filesize
     FROM attachments a
     LEFT JOIN issues       i  ON a.container_type = 'issue'     AND i.id  = a.container_id
     LEFT JOIN wiki_pages   wp ON a.container_type = 'wiki_page' AND wp.id = a.container_id
     LEFT JOIN projects     p  ON a.container_type = 'project'   AND p.id  = a.container_id
     LEFT JOIN journals     j  ON a.container_type = 'journal'   AND j.id  = a.container_id
     WHERE a.created_at < ?1
       AND (
         (a.container_type = 'issue'     AND i.id  IS NULL) OR
         (a.container_type = 'wiki_page' AND wp.id IS NULL) OR
         (a.container_type = 'project'   AND p.id  IS NULL) OR
         (a.container_type = 'journal'   AND j.id  IS NULL)
       )
     ORDER BY a.created_at ASC
     LIMIT ?2`,
  )
    .bind(cutoff, maxRows)
    .all<AttachmentRow & { filesize: number }>();

  const rows = candidates.results ?? [];
  let freedBytes = 0;

  for (const row of rows) {
    // Best-effort R2 delete; if the object is already gone, D1 row deletion
    // still proceeds.
    try {
      await env.FILES.delete(row.r2_key);
    } catch {
      // swallow — orphan R2 references will be reaped by R2 lifecycle rules.
    }
    await env.DB.prepare('DELETE FROM attachments WHERE id = ?1').bind(row.id).run();
    freedBytes += row.filesize;
  }

  return {
    scanned: rows.length,
    deleted: rows.length,
    freedBytes,
    durationMs: Date.now() - started,
  };
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      (async () => {
        const r = await runCleanup(env);
        console.log(
          `[pm-cleanup] scanned=${r.scanned} deleted=${r.deleted} freedBytes=${r.freedBytes} duration=${r.durationMs}ms`,
        );
      })(),
    );
  },

  // Optional fetch handler so you can poke the worker manually via
  // `curl https://pm-cleanup.<your-subdomain>.workers.dev/run`.  The route is
  // unauthenticated so consider locking it behind a secret in production.
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/run' && req.method === 'POST') {
      const result = await runCleanup(env);
      return Response.json(result);
    }
    return new Response('pm-cleanup worker — POST /run to invoke manually', {
      status: 200,
      headers: { 'content-type': 'text/plain' },
    });
  },
};
