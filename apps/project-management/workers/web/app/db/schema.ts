import { sql } from 'drizzle-orm';
import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';

// ---------- Users / Sessions ----------

export const users = sqliteTable(
  'users',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    login: text('login').notNull(),
    email: text('email').notNull(),
    firstname: text('firstname').notNull().default(''),
    lastname: text('lastname').notNull().default(''),
    passwordHash: text('password_hash'),
    passwordSalt: text('password_salt'),
    githubId: integer('github_id'),
    // Link to the allenlabs-auth Better Auth user id. Populated on the
    // first SSO sign-in via /auth/callback; thereafter we look up the
    // local user row by this column. Nullable so existing rows survive
    // the migration unchanged.
    betterAuthUserId: text('better_auth_user_id'),
    avatarUrl: text('avatar_url'),
    admin: integer('admin', { mode: 'boolean' }).notNull().default(false),
    status: text('status', { enum: ['active', 'locked'] }).notNull().default('active'),
    language: text('language').notNull().default('en'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
  },
  (t) => ({
    loginIdx: uniqueIndex('users_login_idx').on(t.login),
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
    githubIdx: uniqueIndex('users_github_idx').on(t.githubId),
    betterAuthIdx: uniqueIndex('users_better_auth_user_id_idx').on(t.betterAuthUserId),
  }),
);

// ---------- Roles / Members ----------

export const roles = sqliteTable('roles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  permissions: text('permissions', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default(sql`('[]')`),
  position: integer('position').notNull().default(1),
});

export const projects = sqliteTable(
  'projects',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    identifier: text('identifier').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    homepage: text('homepage').notNull().default(''),
    isPublic: integer('is_public', { mode: 'boolean' }).notNull().default(false),
    parentId: integer('parent_id'),
    status: text('status', { enum: ['active', 'closed', 'archived'] })
      .notNull()
      .default('active'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    identifierIdx: uniqueIndex('projects_identifier_idx').on(t.identifier),
    parentIdx: index('projects_parent_idx').on(t.parentId),
  }),
);

export const members = sqliteTable(
  'members',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    roleId: integer('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'restrict' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    uniqMember: uniqueIndex('members_unique_idx').on(t.userId, t.projectId, t.roleId),
    projectIdx: index('members_project_idx').on(t.projectId),
    userIdx: index('members_user_idx').on(t.userId),
  }),
);

// ---------- Trackers / Statuses / Priorities ----------

export const trackers = sqliteTable('trackers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  color: text('color').notNull().default('#3a7fa5'),
  position: integer('position').notNull().default(1),
});

export const issueStatuses = sqliteTable('issue_statuses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  isClosed: integer('is_closed', { mode: 'boolean' }).notNull().default(false),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  position: integer('position').notNull().default(1),
  color: text('color').notNull().default('#dde9f5'),
});

export const issuePriorities = sqliteTable('issue_priorities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  position: integer('position').notNull().default(1),
  color: text('color').notNull().default('#e3e9ee'),
});

// ---------- Versions / Categories ----------

export const versions = sqliteTable(
  'versions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    dueDate: text('due_date'),
    status: text('status', { enum: ['open', 'locked', 'closed'] })
      .notNull()
      .default('open'),
    sharing: text('sharing', {
      enum: ['none', 'descendants', 'hierarchy', 'tree', 'system'],
    })
      .notNull()
      .default('none'),
    wikiPage: text('wiki_page'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    projectIdx: index('versions_project_idx').on(t.projectId),
  }),
);

export const issueCategories = sqliteTable(
  'issue_categories',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    assignedToId: integer('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => ({
    projectIdx: index('issue_categories_project_idx').on(t.projectId),
  }),
);

// ---------- Issues ----------

export const issues = sqliteTable(
  'issues',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    trackerId: integer('tracker_id')
      .notNull()
      .references(() => trackers.id, { onDelete: 'restrict' }),
    subject: text('subject').notNull(),
    description: text('description').notNull().default(''),
    statusId: integer('status_id')
      .notNull()
      .references(() => issueStatuses.id, { onDelete: 'restrict' }),
    priorityId: integer('priority_id')
      .notNull()
      .references(() => issuePriorities.id, { onDelete: 'restrict' }),
    authorId: integer('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    assignedToId: integer('assigned_to_id').references(() => users.id, { onDelete: 'set null' }),
    categoryId: integer('category_id').references(() => issueCategories.id, {
      onDelete: 'set null',
    }),
    fixedVersionId: integer('fixed_version_id').references(() => versions.id, {
      onDelete: 'set null',
    }),
    parentId: integer('parent_id'),
    startDate: text('start_date'),
    dueDate: text('due_date'),
    estimatedHours: real('estimated_hours'),
    doneRatio: integer('done_ratio').notNull().default(0),
    isPrivate: integer('is_private', { mode: 'boolean' }).notNull().default(false),
    closedAt: integer('closed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    projectIdx: index('issues_project_idx').on(t.projectId),
    statusIdx: index('issues_status_idx').on(t.statusId),
    assigneeIdx: index('issues_assignee_idx').on(t.assignedToId),
    parentIdx: index('issues_parent_idx').on(t.parentId),
    versionIdx: index('issues_version_idx').on(t.fixedVersionId),
  }),
);

// ---------- Journals (comments + audit log entries on issues) ----------

export const journals = sqliteTable(
  'journals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    issueId: integer('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    notes: text('notes').notNull().default(''),
    privateNotes: integer('private_notes', { mode: 'boolean' }).notNull().default(false),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    issueIdx: index('journals_issue_idx').on(t.issueId),
  }),
);

export const journalDetails = sqliteTable(
  'journal_details',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    journalId: integer('journal_id')
      .notNull()
      .references(() => journals.id, { onDelete: 'cascade' }),
    property: text('property').notNull(), // attr | cf | attachment
    prop_key: text('prop_key').notNull(),
    oldValue: text('old_value'),
    newValue: text('new_value'),
  },
  (t) => ({
    journalIdx: index('journal_details_journal_idx').on(t.journalId),
  }),
);

// ---------- Time tracking ----------

export const timeEntryActivities = sqliteTable('time_entry_activities', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  position: integer('position').notNull().default(1),
});

export const timeEntries = sqliteTable(
  'time_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    issueId: integer('issue_id').references(() => issues.id, { onDelete: 'set null' }),
    activityId: integer('activity_id')
      .notNull()
      .references(() => timeEntryActivities.id, { onDelete: 'restrict' }),
    hours: real('hours').notNull(),
    comments: text('comments').notNull().default(''),
    spentOn: text('spent_on').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    projectIdx: index('time_entries_project_idx').on(t.projectId),
    userIdx: index('time_entries_user_idx').on(t.userId),
    issueIdx: index('time_entries_issue_idx').on(t.issueId),
    spentOnIdx: index('time_entries_spent_on_idx').on(t.spentOn),
  }),
);

// ---------- Wiki ----------

export const wikis = sqliteTable(
  'wikis',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    startPage: text('start_page').notNull().default('Wiki'),
    status: text('status', { enum: ['enabled', 'disabled'] }).notNull().default('enabled'),
  },
  (t) => ({
    projectIdx: uniqueIndex('wikis_project_idx').on(t.projectId),
  }),
);

export const wikiPages = sqliteTable(
  'wiki_pages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    wikiId: integer('wiki_id')
      .notNull()
      .references(() => wikis.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    parentId: integer('parent_id'),
    protected: integer('protected', { mode: 'boolean' }).notNull().default(false),
    currentRevisionId: integer('current_revision_id'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    uniqSlug: uniqueIndex('wiki_pages_slug_idx').on(t.wikiId, t.slug),
  }),
);

export const wikiRevisions = sqliteTable(
  'wiki_revisions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    pageId: integer('page_id')
      .notNull()
      .references(() => wikiPages.id, { onDelete: 'cascade' }),
    authorId: integer('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    text: text('text').notNull(),
    comments: text('comments').notNull().default(''),
    version: integer('version').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    pageIdx: index('wiki_revisions_page_idx').on(t.pageId),
  }),
);

// ---------- Attachments ----------

export const attachments = sqliteTable(
  'attachments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    containerType: text('container_type', {
      enum: ['issue', 'wiki_page', 'project', 'journal'],
    }).notNull(),
    containerId: integer('container_id').notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    filesize: integer('filesize').notNull(),
    digest: text('digest').notNull(),
    r2Key: text('r2_key').notNull(),
    description: text('description').notNull().default(''),
    authorId: integer('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    containerIdx: index('attachments_container_idx').on(t.containerType, t.containerId),
  }),
);

// ---------- Activities (global feed) ----------

export const activities = sqliteTable(
  'activities',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind', {
      enum: [
        'issue_created',
        'issue_updated',
        'issue_closed',
        'comment_added',
        'wiki_edited',
        'time_logged',
        'project_created',
      ],
    }).notNull(),
    refId: integer('ref_id'),
    title: text('title').notNull(),
    body: text('body').notNull().default(''),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
  },
  (t) => ({
    createdIdx: index('activities_created_idx').on(t.createdAt),
    projectIdx: index('activities_project_idx').on(t.projectId),
    userIdx: index('activities_user_idx').on(t.userId),
  }),
);

// ---------- Issue watchers ----------

export const watchers = sqliteTable(
  'watchers',
  {
    issueId: integer('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.issueId, t.userId] }),
  }),
);

// ---------- Enabled trackers per project ----------

export const projectTrackers = sqliteTable(
  'project_trackers',
  {
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    trackerId: integer('tracker_id')
      .notNull()
      .references(() => trackers.id, { onDelete: 'cascade' }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.trackerId] }),
  }),
);

// ---------- Project enabled modules ----------

export const enabledModules = sqliteTable(
  'enabled_modules',
  {
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name', {
      enum: ['issue_tracking', 'time_tracking', 'wiki', 'files', 'gantt', 'roadmap'],
    }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.name] }),
  }),
);

// ---------- Types ----------

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Project = typeof projects.$inferSelect;
export type Issue = typeof issues.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Role = typeof roles.$inferSelect;
export type Version = typeof versions.$inferSelect;
export type TimeEntry = typeof timeEntries.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type WikiPage = typeof wikiPages.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
