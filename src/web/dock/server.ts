import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Command } from '../../shared/schema';
import type { AppState, Notice } from '../../shared/types';
import { connect, type Connection } from '../common/socket';

export interface Toast extends Notice {
  id: number;
}

let toastId = 0;

export function useServer() {
  const [state, setState] = useState<AppState | null>(null);
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const connection = useRef<Connection | null>(null);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);

  const notify = useCallback(
    (notice: Notice) => {
      const toast = { ...notice, id: ++toastId };
      setToasts((list) => [...list.slice(-3), toast]);
      setTimeout(() => dismiss(toast.id), notice.level === 'error' ? 8000 : 3500);
    },
    [dismiss],
  );

  useEffect(() => {
    const conn = connect({ onState: setState, onStatus: setConnected, onNotice: notify });
    connection.current = conn;
    return () => conn.close();
  }, [notify]);

  const send = useCallback((command: Command) => connection.current?.send(command), []);

  return { state, connected, send, toasts, dismiss, notify };
}

export type Send = (command: Command) => void;
