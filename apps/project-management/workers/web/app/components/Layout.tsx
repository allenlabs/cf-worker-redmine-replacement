import { Link, useLocation } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { ToastViewport } from '~/components/ToastViewport';

interface Props {
  user: { id: number; login: string; isAdmin: boolean } | null;
  appName: string;
  children: ReactNode;
}

export function Layout({ user, appName, children }: Props) {
  const loc = useLocation();
  const path = loc.pathname;
  const navLinkClass = (active: boolean) =>
    `px-3 py-2 text-sm font-medium ${active ? 'text-white bg-redmine-700' : 'text-redmine-50 hover:bg-redmine-700/60'}`;
  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <header className="bg-redmine-600 text-white">
        <div className="max-w-7xl mx-auto px-4 flex items-center gap-4 h-12">
          <Link to="/" className="text-white font-semibold no-underline hover:underline">
            {appName}
          </Link>
          <nav className="flex">
            <Link to="/" className={navLinkClass(path === '/')}>Home</Link>
            <Link to="/projects" className={navLinkClass(path.startsWith('/projects'))}>Projects</Link>
            <Link to="/activity" className={navLinkClass(path.startsWith('/activity'))}>Activity</Link>
            <Link to="/my/page" className={navLinkClass(path.startsWith('/my'))}>My page</Link>
            {user?.isAdmin && (
              <Link to="/admin/users" className={navLinkClass(path.startsWith('/admin'))}>Admin</Link>
            )}
          </nav>
          <form action="/search" method="get" className="ml-auto">
            <input
              name="q"
              placeholder="Search…"
              className="rounded bg-white/95 text-gray-900 px-2 py-1 text-sm w-56"
            />
          </form>
          {user ? (
            <div className="flex items-center gap-3 text-sm">
              <Link
                to="/projects/new"
                className="rounded-full bg-white/15 hover:bg-white/25 text-white px-3 py-1 text-sm font-medium no-underline"
              >
                + New
              </Link>
              <span className="text-redmine-50">{user.login}</span>
              <a href="/auth/logout" className="text-white/90 hover:text-white">Logout</a>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm">
              <a href="/auth/login" className="text-white/90 hover:text-white">Sign in</a>
            </div>
          )}
        </div>
      </header>
      <main className="max-w-7xl w-full mx-auto px-4 py-6 flex-1">{children}</main>
      <ToastViewport />
      <footer className="text-center text-xs text-gray-500 py-4">
        Powered by Cloudflare Workers · TanStack Start · D1 · R2
      </footer>
    </div>
  );
}
