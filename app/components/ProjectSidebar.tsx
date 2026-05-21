import { Link, useLocation } from '@tanstack/react-router';

interface Props {
  identifier: string;
  projectName: string;
  modules: string[];
}

export function ProjectSidebar({ identifier, projectName, modules }: Props) {
  const loc = useLocation();
  const base = `/projects/${identifier}`;
  const item = (href: string, label: string, show = true) => {
    if (!show) return null;
    const active = loc.pathname === href || loc.pathname.startsWith(href + '/');
    return (
      <Link
        to={href}
        className={`block px-3 py-1.5 text-sm rounded ${active ? 'bg-redmine-100 text-redmine-800' : 'text-gray-700 hover:bg-gray-100'}`}
      >
        {label}
      </Link>
    );
  };
  return (
    <aside className="w-56 shrink-0 space-y-1 pr-2 border-r border-gray-200">
      <div className="px-3 py-2 text-xs text-gray-500 uppercase tracking-wide">
        {projectName}
      </div>
      {item(`${base}`, 'Overview')}
      {item(`${base}/activity`, 'Activity')}
      {item(`${base}/issues`, 'Issues', modules.includes('issue_tracking'))}
      {item(`${base}/gantt`, 'Gantt', modules.includes('gantt'))}
      {item(`${base}/roadmap`, 'Roadmap', modules.includes('roadmap'))}
      {item(`${base}/wiki`, 'Wiki', modules.includes('wiki'))}
      {item(`${base}/files`, 'Files', modules.includes('files'))}
      {item(`${base}/time`, 'Time', modules.includes('time_tracking'))}
      <div className="px-3 py-1.5 mt-3 text-xs text-gray-500 uppercase tracking-wide">
        Configure
      </div>
      {item(`${base}/members`, 'Members')}
      {item(`${base}/versions`, 'Versions')}
      {item(`${base}/categories`, 'Categories')}
      {item(`${base}/settings`, 'Settings')}
    </aside>
  );
}
