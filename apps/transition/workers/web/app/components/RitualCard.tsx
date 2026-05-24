import type { RitualRow } from '~/server/transition';
import { relativeAgo, targetLabel } from '~/lib/format';

interface RitualCardProps {
  ritual: RitualRow;
}

export function RitualCard({ ritual }: RitualCardProps) {
  return (
    <li className="card p-3 space-y-2" data-testid={`ritual-${ritual.id}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs text-transition-400" data-testid={`target-${ritual.id}`}>
          {targetLabel(ritual.target)}
        </span>
        <span className="text-xs text-slate-500">{relativeAgo(ritual.createdAt)}</span>
      </div>
      <div>
        <div className="text-xs text-slate-500">leaving at</div>
        <p className="text-sm text-slate-100 whitespace-pre-wrap" data-testid={`leaving-${ritual.id}`}>
          {ritual.leavingAt}
        </p>
      </div>
      <div>
        <div className="text-xs text-slate-500">next step</div>
        <p className="text-sm text-slate-100 whitespace-pre-wrap" data-testid={`next-${ritual.id}`}>
          {ritual.nextStep}
        </p>
      </div>
      {ritual.mightForget ? (
        <div>
          <div className="text-xs text-slate-500">might forget</div>
          <p className="text-sm text-slate-300 whitespace-pre-wrap" data-testid={`forget-${ritual.id}`}>
            {ritual.mightForget}
          </p>
        </div>
      ) : null}
    </li>
  );
}
