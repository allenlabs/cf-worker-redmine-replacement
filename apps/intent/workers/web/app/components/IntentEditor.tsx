import { useEffect, useRef, useState } from 'react';
import { relativeAgo } from '~/lib/format';

interface IntentEditorProps {
  initialText: string;
  updatedAt: string;
  onSave: (text: string) => Promise<void>;
}

export function IntentEditor({ initialText, updatedAt, onSave }: IntentEditorProps) {
  const [text, setText] = useState<string>(initialText);
  const [savedText, setSavedText] = useState<string>(initialText);
  const [savedAt, setSavedAt] = useState<string>(updatedAt);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setText(initialText);
    setSavedText(initialText);
    setSavedAt(updatedAt);
  }, [initialText, updatedAt]);

  async function persist() {
    /* v8 ignore next — defensive guard against re-entry; UI disables button while busy. */
    if (busy) return;
    if (text === savedText) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(text);
      setSavedText(text);
      setSavedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3" data-testid="intent-editor">
      <label className="block text-xs text-slate-400">
        What are you doing right now?
      </label>
      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={persist}
        rows={3}
        maxLength={280}
        className="w-full rounded bg-slate-950 border border-slate-800 px-3 py-2 text-base text-slate-100 focus:border-intent-500 focus:outline-none"
        data-testid="intent-input"
        placeholder="(blank)"
      />
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500" data-testid="intent-meta">
          {savedAt
            ? `last updated ${relativeAgo(savedAt)}`
            : 'never set'}
          {text !== savedText ? ' · unsaved' : ''}
        </span>
        <button
          type="button"
          onClick={persist}
          disabled={busy || text === savedText}
          className="rounded bg-intent-600 hover:bg-intent-500 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1.5 text-sm font-semibold text-white"
          data-testid="save-button"
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
      {error ? (
        <p className="text-sm text-red-400" data-testid="form-error">{error}</p>
      ) : null}
      <p className="text-[11px] text-slate-600">{text.length}/280</p>
    </div>
  );
}
