import { useEffect, useRef, useState } from 'preact/hooks';

const clone = <T>(value: T): T => structuredClone(value);

/**
 * Local editable copy of server data. Follows the server while untouched; once edited it is kept
 * until saved (the next server update after a save is adopted, unless the draft was edited again
 * since the save was sent) or reverted.
 */
export function useDraft<T>(source: T) {
  const sourceJson = JSON.stringify(source);
  const [draft, setDraft] = useState<T>(() => clone(source));
  const [dirty, setDirty] = useState(false);
  const [baseJson, setBaseJson] = useState(sourceJson);
  const saving = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The draft as sent by the last save. */
  const sent = useRef<string | null>(null);

  useEffect(() => {
    const wasSaving = saving.current !== null;
    if (saving.current) clearTimeout(saving.current);
    saving.current = null;
    const unchanged = sent.current === JSON.stringify(draft);
    sent.current = null;
    if (!dirty || (wasSaving && unchanged)) {
      setDraft(clone(source));
      setBaseJson(sourceJson);
      setDirty(false);
    } else if (wasSaving) {
      // Edits made after the save was sent (e.g. a photo upload finishing) stay unsaved, not stale.
      setBaseJson(sourceJson);
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
      sent.current = JSON.stringify(draft);
    },
  };
}
