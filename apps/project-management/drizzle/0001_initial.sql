-- Initial schema for CF Redmine
-- Apply with: wrangler d1 migrations apply redmine [--local|--remote]

PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  login TEXT NOT NULL,
  email TEXT NOT NULL,
  firstname TEXT NOT NULL DEFAULT '',
  lastname TEXT NOT NULL DEFAULT '',
  password_hash TEXT,
  password_salt TEXT,
  github_id INTEGER,
  avatar_url TEXT,
  admin INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  language TEXT NOT NULL DEFAULT 'en',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_login_at INTEGER
);
CREATE UNIQUE INDEX users_login_idx ON users(login);
CREATE UNIQUE INDEX users_email_idx ON users(email);
CREATE UNIQUE INDEX users_github_idx ON users(github_id);

CREATE TABLE roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  permissions TEXT NOT NULL DEFAULT '[]',
  position INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  homepage TEXT NOT NULL DEFAULT '',
  is_public INTEGER NOT NULL DEFAULT 0,
  parent_id INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX projects_identifier_idx ON projects(identifier);
CREATE INDEX projects_parent_idx ON projects(parent_id);

CREATE TABLE members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX members_unique_idx ON members(user_id, project_id, role_id);
CREATE INDEX members_project_idx ON members(project_id);
CREATE INDEX members_user_idx ON members(user_id);

CREATE TABLE trackers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#3a7fa5',
  position INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE issue_statuses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_closed INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 1,
  color TEXT NOT NULL DEFAULT '#dde9f5'
);

CREATE TABLE issue_priorities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_default INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 1,
  color TEXT NOT NULL DEFAULT '#e3e9ee'
);

CREATE TABLE versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  sharing TEXT NOT NULL DEFAULT 'none',
  wiki_page TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX versions_project_idx ON versions(project_id);

CREATE TABLE issue_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  assigned_to_id INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX issue_categories_project_idx ON issue_categories(project_id);

CREATE TABLE issues (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tracker_id INTEGER NOT NULL REFERENCES trackers(id) ON DELETE RESTRICT,
  subject TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status_id INTEGER NOT NULL REFERENCES issue_statuses(id) ON DELETE RESTRICT,
  priority_id INTEGER NOT NULL REFERENCES issue_priorities(id) ON DELETE RESTRICT,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assigned_to_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  category_id INTEGER REFERENCES issue_categories(id) ON DELETE SET NULL,
  fixed_version_id INTEGER REFERENCES versions(id) ON DELETE SET NULL,
  parent_id INTEGER,
  start_date TEXT,
  due_date TEXT,
  estimated_hours REAL,
  done_ratio INTEGER NOT NULL DEFAULT 0,
  is_private INTEGER NOT NULL DEFAULT 0,
  closed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX issues_project_idx ON issues(project_id);
CREATE INDEX issues_status_idx ON issues(status_id);
CREATE INDEX issues_assignee_idx ON issues(assigned_to_id);
CREATE INDEX issues_parent_idx ON issues(parent_id);
CREATE INDEX issues_version_idx ON issues(fixed_version_id);

CREATE TABLE journals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  notes TEXT NOT NULL DEFAULT '',
  private_notes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX journals_issue_idx ON journals(issue_id);

CREATE TABLE journal_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_id INTEGER NOT NULL REFERENCES journals(id) ON DELETE CASCADE,
  property TEXT NOT NULL,
  prop_key TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT
);
CREATE INDEX journal_details_journal_idx ON journal_details(journal_id);

CREATE TABLE time_entry_activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_default INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE time_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  issue_id INTEGER REFERENCES issues(id) ON DELETE SET NULL,
  activity_id INTEGER NOT NULL REFERENCES time_entry_activities(id) ON DELETE RESTRICT,
  hours REAL NOT NULL,
  comments TEXT NOT NULL DEFAULT '',
  spent_on TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX time_entries_project_idx ON time_entries(project_id);
CREATE INDEX time_entries_user_idx ON time_entries(user_id);
CREATE INDEX time_entries_issue_idx ON time_entries(issue_id);
CREATE INDEX time_entries_spent_on_idx ON time_entries(spent_on);

CREATE TABLE wikis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  start_page TEXT NOT NULL DEFAULT 'Wiki',
  status TEXT NOT NULL DEFAULT 'enabled'
);
CREATE UNIQUE INDEX wikis_project_idx ON wikis(project_id);

CREATE TABLE wiki_pages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wiki_id INTEGER NOT NULL REFERENCES wikis(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  parent_id INTEGER,
  protected INTEGER NOT NULL DEFAULT 0,
  current_revision_id INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX wiki_pages_slug_idx ON wiki_pages(wiki_id, slug);

CREATE TABLE wiki_revisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_id INTEGER NOT NULL REFERENCES wiki_pages(id) ON DELETE CASCADE,
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  text TEXT NOT NULL,
  comments TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX wiki_revisions_page_idx ON wiki_revisions(page_id);

CREATE TABLE attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  container_type TEXT NOT NULL,
  container_id INTEGER NOT NULL,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  filesize INTEGER NOT NULL,
  digest TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  author_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX attachments_container_idx ON attachments(container_type, container_id);

CREATE TABLE activities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  ref_id INTEGER,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX activities_created_idx ON activities(created_at);
CREATE INDEX activities_project_idx ON activities(project_id);
CREATE INDEX activities_user_idx ON activities(user_id);

CREATE TABLE watchers (
  issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (issue_id, user_id)
);

CREATE TABLE project_trackers (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  tracker_id INTEGER NOT NULL REFERENCES trackers(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, tracker_id)
);

CREATE TABLE enabled_modules (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  PRIMARY KEY (project_id, name)
);
