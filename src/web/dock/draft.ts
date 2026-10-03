import { useEffect, useRef, useState } from 'preact/hooks';

const clone = <T>(value: T): T => structuredClone(value);

/**
 * Local editable copy of server data. Follows the server while untouched; once edited it is kept
 * until saved (the next server update after a save is adopted) or reverted.
 */
export function useDraft<T>(source: T) {
  const sourceJson = JSON.stringify(source);
  const [draft, setDraft] = useState<T>(() => clone(source));
  const [dirty, setDirty] = useState(false);
  const [baseJson, setBaseJson] = useState(sourceJson);
  const saving = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!dirty || saving.current) {
      if (saving.current) clearTimeout(saving.current);
      saving.current = null;
      setDraft(clone(source));
      setBaseJson(sourceJson);
      setDirty(false);
    }
    // Only react to server-side changes.
  }, [sourceJson]);

  return {
    draft,
    dirty,
    /** The server copy changed while this draft had unsaved edits. */
    stale: dirty && baseJson !== sourceJson,
    update(mutate: (draft: T) => void) {
      setDraft((previous) => {
        const next = clone(previous);
        mutate(next);
        return next;
      });
      setDirty(true);
    },
    reset() {
      setDraft(clone(source));
      setBaseJson(sourceJson);
      setDirty(false);
    },
    /** Call right after sending a save; the next server update replaces the draft. */
    saved() {
      if (saving.current) clearTimeout(saving.current);
      saving.current = setTimeout(() => (saving.current = null), 3000);
    },
  };
}
