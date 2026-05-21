import { createServerFn } from '@tanstack/react-start';
import { and, eq, desc } from 'drizzle-orm';
import { z } from 'zod';
import { users, wikiPages, wikiRevisions, wikis } from '~/db/schema';
import { slugify } from '~/lib/format';
import { logActivity } from './activities';
import { getDb, requirePermission, requireUser } from './auth';

async function getOrCreateWiki(projectId: number) {
  const db = getDb();
  let wiki = await db.query.wikis.findFirst({ where: eq(wikis.projectId, projectId) });
  if (!wiki) {
    const [created] = await db.insert(wikis).values({ projectId }).returning();
    wiki = created;
  }
  return wiki;
}

export const listWikiPages = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ projectId: z.number() }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'view_wiki_pages');
    const db = getDb();
    const wiki = await getOrCreateWiki(data.projectId);
    const pages = await db
      .select({
        id: wikiPages.id,
        title: wikiPages.title,
        slug: wikiPages.slug,
        parentId: wikiPages.parentId,
        updatedAt: wikiPages.updatedAt,
      })
      .from(wikiPages)
      .where(eq(wikiPages.wikiId, wiki.id))
      .orderBy(wikiPages.title);
    return { wiki, pages };
  });

export const getWikiPage = createServerFn({ method: 'GET' })
  .validator((d: unknown) => z.object({ projectId: z.number(), slug: z.string() }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'view_wiki_pages');
    const db = getDb();
    const wiki = await getOrCreateWiki(data.projectId);
    const page = await db.query.wikiPages.findFirst({
      where: and(eq(wikiPages.wikiId, wiki.id), eq(wikiPages.slug, data.slug)),
    });
    if (!page) return { page: null, revision: null, revisions: [] };
    const revision = page.currentRevisionId
      ? await db.query.wikiRevisions.findFirst({
          where: eq(wikiRevisions.id, page.currentRevisionId),
        })
      : null;
    const revisions = await db
      .select({
        id: wikiRevisions.id,
        version: wikiRevisions.version,
        comments: wikiRevisions.comments,
        createdAt: wikiRevisions.createdAt,
        authorLogin: users.login,
      })
      .from(wikiRevisions)
      .innerJoin(users, eq(users.id, wikiRevisions.authorId))
      .where(eq(wikiRevisions.pageId, page.id))
      .orderBy(desc(wikiRevisions.version));
    return { page, revision, revisions };
  });

export const saveWikiPage = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        projectId: z.number(),
        slug: z.string(),
        title: z.string().min(1).max(255),
        text: z.string(),
        comments: z.string().optional().default(''),
        parentId: z.number().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { user } = await requirePermission(data.projectId, 'edit_wiki_pages');
    const db = getDb();
    const wiki = await getOrCreateWiki(data.projectId);
    const slug = data.slug || slugify(data.title);
    let page = await db.query.wikiPages.findFirst({
      where: and(eq(wikiPages.wikiId, wiki.id), eq(wikiPages.slug, slug)),
    });
    if (!page) {
      const [created] = await db
        .insert(wikiPages)
        .values({
          wikiId: wiki.id,
          slug,
          title: data.title,
          parentId: data.parentId ?? null,
        })
        .returning();
      page = created;
    } else {
      await db
        .update(wikiPages)
        .set({ title: data.title, parentId: data.parentId ?? null, updatedAt: new Date() })
        .where(eq(wikiPages.id, page.id));
    }
    const previous = await db
      .select({ version: wikiRevisions.version })
      .from(wikiRevisions)
      .where(eq(wikiRevisions.pageId, page.id))
      .orderBy(desc(wikiRevisions.version))
      .limit(1);
    const nextVersion = (previous[0]?.version ?? 0) + 1;
    const [revision] = await db
      .insert(wikiRevisions)
      .values({
        pageId: page.id,
        authorId: user.id,
        text: data.text,
        comments: data.comments,
        version: nextVersion,
      })
      .returning();
    await db
      .update(wikiPages)
      .set({ currentRevisionId: revision.id })
      .where(eq(wikiPages.id, page.id));

    await logActivity({
      projectId: data.projectId,
      userId: user.id,
      kind: 'wiki_edited',
      refId: page.id,
      title: `${user.login} edited wiki page ${data.title}`,
      body: data.comments,
    });

    return { page, revision };
  });

export const deleteWikiPage = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ id: z.number(), projectId: z.number() }).parse(d))
  .handler(async ({ data }) => {
    await requirePermission(data.projectId, 'manage_wiki');
    const db = getDb();
    await db.delete(wikiPages).where(eq(wikiPages.id, data.id));
    return { ok: true };
  });
