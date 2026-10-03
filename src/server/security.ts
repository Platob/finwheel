import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage } from 'node:http';

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

export interface SecurityOptions {
  /** Interface the server is bound to. */
  bindHost: string;
  /** Optional shared secret required for control commands. */
  token: string | null;
  /** Extra origins allowed to talk to the server. */
  allowedOrigins: string[];
}

export type Verdict = { ok: true } | { ok: false; status: number; reason: string };

export function isLoopback(hostname: string): boolean {
  return LOOPBACK.has(hostname.toLowerCase());
}

function hostnameOf(hostHeader: string): string {
  try {
    return new URL(`http://${hostHeader}`).hostname;
  } catch {
    return '';
  }
}

/**
 * Guards the local server against other websites the streamer visits:
 * - Host check (when bound to loopback) defeats DNS-rebinding attacks.
 * - Origin check stops cross-site WebSocket and fetch requests.
 * - Optional token restricts who may control the wheel.
 */
export class Security {
  private readonly token: Buffer | null;
  private readonly checkHost: boolean;
  private readonly allowedOrigins: Set<string>;

  constructor(options: SecurityOptions) {
    this.token = options.token ? Buffer.from(options.token) : null;
    this.checkHost = isLoopback(options.bindHost);
    this.allowedOrigins = new Set(
      options.allowedOrigins.map((o) => o.trim().replace(/\/$/, '')).filter(Boolean),
    );
  }

  get tokenRequired(): boolean {
    return this.token !== null;
  }

  checkRequest(req: IncomingMessage): Verdict {
    const host = req.headers.host ?? '';
    if (this.checkHost && !isLoopback(hostnameOf(host))) {
      return { ok: false, status: 403, reason: 'Host not allowed' };
    }
    const origin = req.headers.origin;
    if (origin === undefined) return { ok: true };
    if (this.allowedOrigins.has(origin)) return { ok: true };
    try {
      const url = new URL(origin);
      if (isLoopback(url.hostname) || url.host === host) return { ok: true };
    } catch {
      // Opaque origins such as "null" are rejected below.
    }
    return { ok: false, status: 403, reason: 'Origin not allowed' };
  }

  /** Whether the request carries the control token (always true when no token is configured). */
  hasControl(req: IncomingMessage, url: URL): boolean {
    if (!this.token) return true;
    const header = req.headers.authorization;
    const candidate =
      (header?.startsWith('Bearer ') ? header.slice(7) : undefined) ??
      firstHeader(req.headers['x-finwheel-token']) ??
      url.searchParams.get('token') ??
      '';
    const given = Buffer.from(candidate);
    return given.length === this.token.length && timingSafeEqual(given, this.token);
  }
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
