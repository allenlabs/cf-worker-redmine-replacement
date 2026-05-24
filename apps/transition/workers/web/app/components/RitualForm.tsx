import { useState } from 'react';
import { TARGETS, type SaveRitualInput, type Target } from '~/server/transition';

interface RitualFormProps {
  onSubmit: (input: SaveRitualInput) => Promise<void>;
  busy?: boolean;
  error?: string | null;
}

export function RitualForm({ onSubmit, busy, error }: RitualFormProps) {
  const [leavingAt, setLeavingAt] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [mightForget, setMightForget] = useState('');
  const [target, setTarget] = useState<Target | ''>('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!leavingAt.trim() || !nextStep.trim()) return;
    void onSubmit({
      leaving_at: leavingAt.trim(),
      next_step: nextStep.trim(),
      might_forget: mightForget.trim() || null,
      target: target || null,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" data-testid="ritual-form">
      <div>
        <label className="block text-xs text-slate-400 mb-1">
          1. Where am I leaving this?
        </label>
        <textarea
          value={leavingAt}
          onChange={(e) => setLeavingAt(e.target.value)}
          rows={2}
          className="w-full rounded bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-transition-500 focus:outline-none"
          data-testid="leaving-input"
          placeholder="What state is the project in right now?"
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">
          2. What&apos;s the very next step?
        </label>
        <textarea
          value={nextStep}
          onChange={(e) => setNextStep(e.target.value)}
          rows={2}
          className="w-full rounded bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-transition-500 focus:outline-none"
          data-testid="next-input"
          placeholder="When I come back, do X first."
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">
          3. What might I forget?
        </label>
        <textarea
          value={mightForget}
          onChange={(e) => setMightForget(e.target.value)}
          rows={2}
          className="w-full rounded bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-transition-500 focus:outline-none"
          data-testid="forget-input"
          placeholder="Easy to lose: a half-thought, a tab, a config bit."
        />
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">
          Send a copy to…
        </label>
        <select
          value={target}
          onChange={(e) => setTarget((e.target.value as Target | '') || '')}
          className="rounded bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-transition-500 focus:outline-none"
          data-testid="target-select"
        >
          <option value="">— keep here only —</option>
          {TARGETS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>
      {error ? <p className="text-sm text-red-400" data-testid="form-error">{error}</p> : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy || !leavingAt.trim() || !nextStep.trim()}
          className="rounded bg-transition-600 hover:bg-transition-500 disabled:opacity-50 disabled:cursor-not-allowed px-4 py-2 text-sm font-semibold text-white"
          data-testid="save-button"
        >
          {busy ? 'Saving…' : 'Save ritual'}
        </button>
      </div>
    </form>
  );
}
