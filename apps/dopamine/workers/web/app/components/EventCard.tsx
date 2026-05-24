import type { EventRow } from '~/server/dopamine';
import { importanceLabel, kindLabel, relativeAgo } from '~/lib/format';

interface EventCardProps {
  event: EventRow;
  highlight?: boolean;
}

export function EventCard({ event, highlight }: EventCardProps) {
  return (
    <li
      className={`card p-3 ${highlight ? 'border-dopamine-700 bg-dopamine-900/30' : ''}`}
      data-testid={`event-${event.id}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs uppercase tracking-wide text-dopamine-400">
          {kindLabel(event.kind)}
        </span>
        <span className="text-xs text-slate-500">{relativeAgo(event.occurredAt)}</span>
      </div>
      <h3 className="text-sm font-semibold text-slate-100 mt-1" data-testid={`title-${event.id}`}>
        {event.title}
      </h3>
      {event.body ? (
        <p className="text-xs text-slate-400 mt-1 whitespace-pre-wrap">{event.body}</p>
      ) : null}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        {event.importance > 1 ? (
          <span
            className="rounded bg-dopamine-800/60 text-dopamine-200 px-1.5 py-0.5"
            data-testid={`importance-${event.id}`}
          >
            {importanceLabel(event.importance)}
          </span>
        ) : null}
        {event.tags.map((t) => (
          <span key={t} className="rounded bg-slate-800 text-slate-300 px-1.5 py-0.5">
            #{t}
          </span>
        ))}
        {event.sourceRef ? (
          <span className="text-slate-500 font-mono" data-testid={`ref-${event.id}`}>
            {event.sourceRef}
          </span>
        ) : null}
      </div>
    </li>
  );
}
