-- Seed default trackers, statuses, priorities, roles, activities.
-- Run with: npm run db:seed:local  (or db:seed for remote)

INSERT OR IGNORE INTO trackers (id, name, color, position) VALUES
  (1, 'Bug', '#d9534f', 1),
  (2, 'Feature', '#5cb85c', 2),
  (3, 'Support', '#f0ad4e', 3),
  (4, 'Task', '#5bc0de', 4);

INSERT OR IGNORE INTO issue_statuses (id, name, is_closed, is_default, position, color) VALUES
  (1, 'New',         0, 1, 1, '#dde9f5'),
  (2, 'In Progress', 0, 0, 2, '#fff3cd'),
  (3, 'Resolved',    0, 0, 3, '#d4edda'),
  (4, 'Feedback',    0, 0, 4, '#fcecd5'),
  (5, 'Closed',      1, 0, 5, '#e9ecef'),
  (6, 'Rejected',    1, 0, 6, '#f5d6d6');

INSERT OR IGNORE INTO issue_priorities (id, name, is_default, position, color) VALUES
  (1, 'Low',       0, 1, '#c6e2f5'),
  (2, 'Normal',    1, 2, '#e3e9ee'),
  (3, 'High',      0, 3, '#fde2cf'),
  (4, 'Urgent',    0, 4, '#f6c4c4'),
  (5, 'Immediate', 0, 5, '#e7adad');

-- Default Redmine-style roles.  Permissions are a JSON array of strings; see app/lib/permissions.ts.
INSERT OR IGNORE INTO roles (id, name, position, permissions) VALUES
  (1, 'Manager',   1, json('["view_project","edit_project","manage_members","manage_versions","manage_categories","view_issues","add_issues","edit_issues","delete_issues","add_issue_notes","manage_wiki","edit_wiki_pages","view_wiki_pages","view_time_entries","log_time","edit_time_entries","manage_files","view_files","view_gantt","view_roadmap"]')),
  (2, 'Developer', 2, json('["view_project","view_issues","add_issues","edit_issues","add_issue_notes","view_wiki_pages","edit_wiki_pages","view_time_entries","log_time","view_files","manage_files","view_gantt","view_roadmap"]')),
  (3, 'Reporter',  3, json('["view_project","view_issues","add_issues","add_issue_notes","view_wiki_pages","view_files","view_gantt","view_roadmap"]'));

INSERT OR IGNORE INTO time_entry_activities (id, name, is_default, position) VALUES
  (1, 'Design',      0, 1),
  (2, 'Development', 1, 2),
  (3, 'Testing',     0, 3),
  (4, 'Support',     0, 4);
