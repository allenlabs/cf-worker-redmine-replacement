export type Permission =
  | 'view_project'
  | 'edit_project'
  | 'close_project'
  | 'delete_project'
  | 'manage_members'
  | 'manage_versions'
  | 'manage_categories'
  | 'view_issues'
  | 'add_issues'
  | 'edit_issues'
  | 'delete_issues'
  | 'add_issue_notes'
  | 'manage_wiki'
  | 'edit_wiki_pages'
  | 'view_wiki_pages'
  | 'view_time_entries'
  | 'log_time'
  | 'edit_time_entries'
  | 'manage_files'
  | 'view_files'
  | 'view_gantt'
  | 'view_roadmap';

export const ALL_PERMISSIONS: Permission[] = [
  'view_project',
  'edit_project',
  'close_project',
  'delete_project',
  'manage_members',
  'manage_versions',
  'manage_categories',
  'view_issues',
  'add_issues',
  'edit_issues',
  'delete_issues',
  'add_issue_notes',
  'manage_wiki',
  'edit_wiki_pages',
  'view_wiki_pages',
  'view_time_entries',
  'log_time',
  'edit_time_entries',
  'manage_files',
  'view_files',
  'view_gantt',
  'view_roadmap',
];

export interface AuthContext {
  userId: number;
  isAdmin: boolean;
  permissionsByProject: Record<number, Set<Permission>>;
}

export function hasPermission(
  ctx: AuthContext,
  projectId: number,
  permission: Permission,
): boolean {
  if (ctx.isAdmin) return true;
  const set = ctx.permissionsByProject[projectId];
  return set?.has(permission) ?? false;
}

export class ForbiddenError extends Error {
  constructor(message = 'Forbidden') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export class UnauthorizedError extends Error {
  constructor(message = 'Unauthorized') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}
