import { createFileRoute, getRouteApi } from '@tanstack/react-router';
import { formatDate } from '~/lib/format';
import { listIssues } from '~/server/issues';
import { getProject } from '~/server/projects';

const parentRoute = getRouteApi('/projects/$identifier');

export const Route = createFileRoute('/projects/$identifier/gantt')({
  loader: async ({ params }) => {
    const project = await getProject({ data: { identifier: params.identifier } });
    return {
      issues: await listIssues({
        data: { projectId: project.id, statusFilter: 'all', sort: 'id' },
      }),
    };
  },
  component: GanttPage,
});

const DAY = 24 * 60 * 60 * 1000;

function GanttPage() {
  const project = parentRoute.useLoaderData();
  const { issues } = Route.useLoaderData();

  const dated = issues.filter((i) => i.startDate || i.dueDate);
  if (dated.length === 0) {
    return (
      <div>
        <h2 className="text-xl font-semibold mb-3">Gantt</h2>
        <p className="text-sm text-gray-500">
          Add a start/due date to issues to see them on the Gantt chart.
        </p>
      </div>
    );
  }

  // Determine date window
  const today = new Date();
  let min = today.getTime();
  let max = today.getTime();
  for (const i of dated) {
    if (i.startDate) min = Math.min(min, new Date(i.startDate).getTime());
    if (i.dueDate) max = Math.max(max, new Date(i.dueDate).getTime());
  }
  // pad
  min -= 3 * DAY;
  max += 3 * DAY;
  const totalDays = Math.max(7, Math.round((max - min) / DAY));
  const dayW = Math.max(18, Math.min(40, Math.floor(900 / totalDays)));
  const width = dayW * totalDays;
  const rowH = 28;
  const headerH = 28;
  const height = headerH + dated.length * rowH;

  const months: Array<{ label: string; offset: number; width: number }> = [];
  let cursor = new Date(min);
  while (cursor.getTime() < max) {
    const monthStart = new Date(cursor.getFullYear(), cursor.getMonth(), 1).getTime();
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).getTime();
    const startOffset = Math.max(0, Math.round((monthStart - min) / DAY)) * dayW;
    const w = Math.min(width - startOffset, Math.round((monthEnd - Math.max(monthStart, min)) / DAY) * dayW);
    if (w > 0) {
      months.push({
        label: cursor.toLocaleDateString(undefined, { year: 'numeric', month: 'short' }),
        offset: startOffset,
        width: w,
      });
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-3">Gantt</h2>
      <div className="card overflow-auto">
        <div className="flex">
          <div className="w-72 shrink-0 border-r border-gray-200">
            <div className="h-7 bg-gray-100 px-2 py-1 text-xs font-semibold uppercase">Issue</div>
            {dated.map((i) => (
              <div key={i.id} className="h-7 px-2 py-1 text-sm truncate border-b border-gray-100">
                <span className="font-mono text-xs text-gray-500 mr-1">#{i.id}</span>{i.subject}
              </div>
            ))}
          </div>
          <svg width={width} height={height} className="block">
            {/* month header */}
            {months.map((m, idx) => (
              <g key={idx}>
                <rect x={m.offset} y={0} width={m.width} height={headerH} fill="#f3f4f6" stroke="#e5e7eb" />
                <text x={m.offset + 4} y={18} fontSize="11" fill="#374151">{m.label}</text>
              </g>
            ))}
            {/* row backgrounds */}
            {dated.map((_, idx) => (
              <rect
                key={idx}
                x={0}
                y={headerH + idx * rowH}
                width={width}
                height={rowH}
                fill={idx % 2 === 0 ? '#ffffff' : '#fafafa'}
              />
            ))}
            {/* today marker */}
            {(() => {
              const x = Math.round((today.getTime() - min) / DAY) * dayW;
              return <line x1={x} y1={0} x2={x} y2={height} stroke="#dc2626" strokeWidth={1} />;
            })()}
            {/* bars */}
            {dated.map((i, idx) => {
              const s = new Date(i.startDate ?? i.dueDate ?? min).getTime();
              const e = new Date(i.dueDate ?? i.startDate ?? min).getTime();
              const x = Math.round((s - min) / DAY) * dayW;
              const w = Math.max(dayW / 2, Math.round((e - s) / DAY + 1) * dayW);
              const y = headerH + idx * rowH + 6;
              const fillFull = i.statusIsClosed ? '#94a3b8' : '#3a7fa5';
              const doneW = (w * (i.doneRatio ?? 0)) / 100;
              return (
                <g key={i.id}>
                  <rect x={x} y={y} width={w} height={rowH - 12} rx={3} fill="#e5e7eb" />
                  {doneW > 0 ? <rect x={x} y={y} width={doneW} height={rowH - 12} rx={3} fill={fillFull} /> : null}
                  <rect x={x} y={y} width={w} height={rowH - 12} rx={3} fill="none" stroke="#9ca3af" />
                  <text x={x + 4} y={y + 12} fontSize="10" fill="#1f2937">
                    {i.doneRatio}% · {formatDate(i.dueDate ?? i.startDate)}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
