import { createServerFn } from '@tanstack/react-start';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { attachments } from '~/db/schema';
import { getDb, getEnv, requirePermission } from './auth';

export const listAttachments = createServerFn({ method: 'GET' })
  .validator((d: unknown) =>
    z
      .object({
        projectId: z.number(),
        containerType: z.enum(['issue', 'wiki_page', 'project', 'journal']),
        containerId: z.number(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'view_files');
    const db = getDb();
    return db
      .select()
      .from(attachments)
      .where(
        and(
          eq(attachments.containerType, data.containerType),
          eq(attachments.containerId, data.containerId),
        ),
      )
      .orderBy(desc(attachments.createdAt));
  });

export const listProjectFiles = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ projectId: z.number() }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'view_files');
    const db = getDb();
    return db
      .select()
      .from(attachments)
      .where(
        and(eq(attachments.containerType, 'project'), eq(attachments.containerId, data.projectId)),
      )
      .orderBy(desc(attachments.createdAt));
  });

export async function uploadAttachment(opts: {
  projectId: number;
  containerType: 'issue' | 'wiki_page' | 'project' | 'journal';
  containerId: number;
  file: File;
  authorId: number;
  description?: string;
}): Promise<typeof attachments.$inferSelect> {
  const env = getEnv();
  const arr = new Uint8Array(await opts.file.arrayBuffer());
  const digestBuf = await crypto.subtle.digest('SHA-256', arr);
  const digest = Array.from(new Uint8Array(digestBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const r2Key = `${opts.containerType}/${opts.projectId}/${digest}_${opts.file.name}`;
  await env.FILES.put(r2Key, arr, {
    httpMetadata: { contentType: opts.file.type || 'application/octet-stream' },
  });
  const db = getDb(env);
  const [row] = await db
    .insert(attachments)
    .values({
      containerType: opts.containerType,
      containerId: opts.containerId,
      filename: opts.file.name,
      contentType: opts.file.type || 'application/octet-stream',
      filesize: opts.file.size,
      digest,
      r2Key,
      authorId: opts.authorId,
      description: opts.description ?? '',
    })
    .returning();
  return row;
}

export async function streamAttachment(id: number): Promise<Response> {
  const env = getEnv();
  const db = getDb(env);
  const att = await db.query.attachments.findFirst({ where: eq(attachments.id, id) });
  if (!att) return new Response('Not found', { status: 404 });
  const obj = await env.FILES.get(att.r2Key);
  if (!obj) return new Response('Missing', { status: 404 });
  return new Response(obj.body, {
    headers: {
      'Content-Type': att.contentType,
      'Content-Length': String(att.filesize),
      'Content-Disposition': `inline; filename="${encodeURIComponent(att.filename)}"`,
      'Cache-Control': 'private, max-age=300',
    },
  });
}

export const deleteAttachment = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ id: z.number(), projectId: z.number() }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'manage_files');
    const env = getEnv();
    const db = getDb(env);
    const att = await db.query.attachments.findFirst({ where: eq(attachments.id, data.id) });
    if (!att) return { ok: true };
    await env.FILES.delete(att.r2Key);
    await db.delete(attachments).where(eq(attachments.id, data.id));
    return { ok: true };
  });
