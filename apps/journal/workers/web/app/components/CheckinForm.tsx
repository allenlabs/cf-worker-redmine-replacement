import { useState } from 'react';
import type { EntryRow } from '~/server/journal';

interface CheckinFormProps {
  initial: EntryRow | null;
  date: string;
  onSubmit: (data: {
    mood: number;
    energy: number;
    focus: number;
    mind: string;
    blockers: string;
    date: string;
  }) => void;
  busy?: boolean;
  error?: string | null;
}

const LABELS = ['rough', 'low', 'meh', 'good', 'great'];

interface ScoreRowProps {
  label: string;
  value: number;
  testId: string;
  onChange: (v: number) => void;
}

export function ScoreRow({ label, value, testId, onChange }: ScoreRowProps) {
  return (
    <div className="flex items-center gap-3" data-testid={`row-${testId}`}>
      <span className="w-16 text-sm text-slate-400">{label}</span>
      <div className="flex gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`h-8 w-8 rounded text-sm font-semibold border ${
              value === n
                ? 'bg-journal-600 border-journal-500 text-white'
                : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800'
            }`}
            data-testid={`${testId}-${n}`}
            aria-label={`${label} ${n}`}
          >
            {n}
          </button>
        ))}
      </div>
      <span className="text-xs text-slate-500" data-testid={`${testId}-label`}>
        {LABELS[value - 1]}
      </span>
    </div>
  );
}

export function CheckinForm({ initial, date, onSubmit, busy, error }: CheckinFormProps) {
  const [mood, setMood] = useState<number>(initial?.mood ?? 3);
  const [energy, setEnergy] = useState<number>(initial?.energy ?? 3);
  const [focus, setFocus] = useState<number>(initial?.focus ?? 3);
  const [mind, setMind] = useState<string>(initial?.mind ?? '');
  const [blockers, setBlockers] = useState<string>(initial?.blockers ?? '');

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ mood, energy, focus, mind, blockers, date });
      }}
      className="space-y-4"
      data-testid="checkin-form"
    >
      <div className="space-y-2">
        <ScoreRow label="mood" value={mood} testId="mood" onChange={setMood} />
        <ScoreRow label="energy" value={energy} testId="energy" onChange={setEnergy} />
        <ScoreRow label="focus" value={focus} testId="focus" onChange={setFocus} />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">what&apos;s on your mind?</label>
        <textarea
          value={mind}
          onChange={(e) => setMind(e.target.value)}
          rows={3}
          className="w-full rounded bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-journal-500 focus:outline-none"
          data-testid="mind-input"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">what&apos;s blocking you?</label>
        <textarea
          value={blockers}
          onChange={(e) => setBlockers(e.target.value)}
          rows={2}
          className="w-full rounded bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-journal-500 focus:outline-none"
          data-testid="blockers-input"
        />
      </div>
      {error ? <p className="text-sm text-red-400" data-testid="form-error">{error}</p> : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-journal-600 hover:bg-journal-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white"
          data-testid="save-button"
        >
          {busy ? 'Saving…' : initial ? 'Update' : 'Save'}
        </button>
      </div>
    </form>
  );
}
