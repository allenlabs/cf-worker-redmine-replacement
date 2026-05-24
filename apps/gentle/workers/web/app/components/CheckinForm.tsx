import { useState } from 'react';
import type { CheckinRow } from '~/server/gentle';

export interface CheckinFormValues {
  slept_ok: boolean | null;
  meds: boolean | null;
  ate: boolean | null;
  moved: boolean | null;
  talked: boolean | null;
  note: string;
  date: string;
}

interface CheckinFormProps {
  initial: CheckinRow | null;
  date: string;
  onSubmit: (data: CheckinFormValues) => void;
  busy?: boolean;
  error?: string | null;
}

const TOGGLES: Array<{ key: keyof Omit<CheckinFormValues, 'note' | 'date'>; label: string; question: string }> = [
  { key: 'slept_ok', label: 'slept', question: 'slept ok?' },
  { key: 'meds',     label: 'meds',  question: 'took meds?' },
  { key: 'ate',      label: 'ate',   question: 'ate?' },
  { key: 'moved',    label: 'moved', question: 'moved a little?' },
  { key: 'talked',   label: 'talked', question: 'talked to a human?' },
];

interface ToggleRowProps {
  label: string;
  question: string;
  value: boolean | null;
  testId: string;
  onChange: (v: boolean | null) => void;
}

// Tri-state pill row: yes / no / blank.  No streak break for "blank" —
// gentle's whole purpose is to NOT force a yes/no when the user genuinely
// didn't know.  An explicit "no" still counts as engaging with the
// check-in.
export function ToggleRow({ label, question, value, testId, onChange }: ToggleRowProps) {
  function pillCls(active: boolean): string {
    return active
      ? 'bg-gentle-600 border-gentle-500 text-white'
      : 'bg-slate-900 border-slate-700 text-slate-300 hover:bg-slate-800';
  }
  return (
    <div className="flex items-center gap-3" data-testid={`row-${testId}`}>
      <span className="w-24 text-sm text-slate-400" title={question}>{label}</span>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => onChange(value === true ? null : true)}
          className={`h-8 px-3 rounded text-sm font-medium border ${pillCls(value === true)}`}
          data-testid={`${testId}-yes`}
          aria-pressed={value === true}
          aria-label={`${question} — yes`}
        >
          yes
        </button>
        <button
          type="button"
          onClick={() => onChange(value === false ? null : false)}
          className={`h-8 px-3 rounded text-sm font-medium border ${pillCls(value === false)}`}
          data-testid={`${testId}-no`}
          aria-pressed={value === false}
          aria-label={`${question} — no`}
        >
          no
        </button>
      </div>
    </div>
  );
}

export function CheckinForm({ initial, date, onSubmit, busy, error }: CheckinFormProps) {
  const [sleptOk, setSleptOk] = useState<boolean | null>(initial?.sleptOk ?? null);
  const [meds, setMeds] = useState<boolean | null>(initial?.meds ?? null);
  const [ate, setAte] = useState<boolean | null>(initial?.ate ?? null);
  const [moved, setMoved] = useState<boolean | null>(initial?.moved ?? null);
  const [talked, setTalked] = useState<boolean | null>(initial?.talked ?? null);
  const [note, setNote] = useState<string>(initial?.note ?? '');

  const setters: Record<string, (v: boolean | null) => void> = {
    slept_ok: setSleptOk,
    meds: setMeds,
    ate: setAte,
    moved: setMoved,
    talked: setTalked,
  };
  const values: Record<string, boolean | null> = {
    slept_ok: sleptOk,
    meds,
    ate,
    moved,
    talked,
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ slept_ok: sleptOk, meds, ate, moved, talked, note, date });
      }}
      className="space-y-4"
      data-testid="checkin-form"
    >
      <div className="space-y-2">
        {TOGGLES.map((t) => (
          <ToggleRow
            key={t.key}
            label={t.label}
            question={t.question}
            value={values[t.key] ?? null}
            testId={t.key}
            onChange={setters[t.key]!}
          />
        ))}
      </div>
      <div>
        <label className="block text-xs text-slate-400 mb-1">
          anything to note? (optional)
        </label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          className="w-full rounded bg-slate-950 border border-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-gentle-500 focus:outline-none"
          data-testid="note-input"
          placeholder="one line is plenty"
        />
      </div>
      {error ? <p className="text-sm text-red-400" data-testid="form-error">{error}</p> : null}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={busy}
          className="rounded bg-gentle-600 hover:bg-gentle-500 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white"
          data-testid="save-button"
        >
          {busy ? 'Saving…' : initial ? 'Update' : 'Save'}
        </button>
      </div>
    </form>
  );
}
