import { timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import { GsiNormalizeError, normalizeGsiPayload } from './normalize.js';
import { sanitizeRecordedPayload } from './record.js';
import { ScoreHistory } from './score-history.js';
import { renderSmokePage } from './smoke-page.js';
import type { GameState } from './types.js';

const MAX_BODY_BYTES = 1_500_000;

export interface GsiServerOptions {
  /** Bind address. Defaults to loopback. */
  host?: string;
  /** Defaults to 3000. Use `0` in tests to let the OS pick a port. */
  port?: number;
  /**
   * When set, the JSON body must contain `auth.token` equal to this value.
   * Leave unset to accept any local sender (the sample cfg still sends a token).
   */
  authToken?: string;
  /** Called after a payload is stored. Receives its own copy of the state. */
  onState?: (state: GameState) => void;
  /**
   * Called after a payload is accepted. `payload` already has the auth token,
   * positions, facing, and grenades removed. `receivedAt` is the accept time.
   */
  onAccepted?: (event: { payload: unknown; receivedAt: Date; state: GameState }) => void;
}

export interface ListeningAddress {
  host: string;
  port: number;
}

/**
 * Local HTTP listener for Valve CS2 Game State Integration POSTs.
 * Also serves `GET /` (smoke page) and `GET /state` (latest GameState JSON).
 */
export class GsiServer {
  private server: http.Server | null = null;
  private latest: GameState | null = null;
  readonly history = new ScoreHistory();

  constructor(private readonly options: GsiServerOptions = {}) {}

  /** Copy of the newest accepted state, or `null` before the first POST. */
  getLatest(): GameState | null {
    return this.latest ? structuredClone(this.latest) : null;
  }

  start(): Promise<ListeningAddress> {
    if (this.server) {
      return Promise.reject(new Error('GSI server is already listening'));
    }

    const host = this.options.host ?? '127.0.0.1';
    const port = this.options.port ?? 3000;
    const server = http.createServer((req, res) => {
      void this.handle(req, res);
    });
    this.server = server;

    return new Promise((resolve, reject) => {
      const onError = (error: Error): void => {
        this.server = null;
        reject(error);
      };
      server.once('error', onError);
      server.listen(port, host, () => {
        server.removeListener('error', onError);
        const address = server.address();
        const actualPort = typeof address === 'object' && address ? address.port : port;
        resolve({ host, port: actualPort });
      });
    });
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (!server) {
      return;
    }
    this.server = null;
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  private async handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const method = req.method ?? 'GET';

      if (method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
        sendText(res, 200, 'text/html; charset=utf-8', renderSmokePage(this.latest));
        return;
      }

      if (method === 'GET' && url.pathname === '/state') {
        sendJson(res, 200, this.latest);
        return;
      }

      if (method === 'GET' && url.pathname === '/health') {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (method === 'POST' && (url.pathname === '/' || url.pathname === '/gsi')) {
        await this.handlePost(req, res);
        return;
      }

      sendJson(res, 404, { error: 'not found' });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'internal error';
      const status = message === 'payload too large' ? 413 : 500;
      sendJson(res, status, { error: message });
    }
  }

  private async handlePost(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await readBody(req);
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      sendJson(res, 400, { error: 'invalid JSON' });
      return;
    }

    if (!authMatches(payload, this.options.authToken)) {
      sendJson(res, 401, { error: 'invalid auth token' });
      return;
    }

    let state: GameState;
    try {
      state = normalizeGsiPayload(payload, this.history);
    } catch (error) {
      if (error instanceof GsiNormalizeError) {
        sendJson(res, 400, { error: error.message });
        return;
      }
      throw error;
    }

    this.latest = state;
    const receivedAt = new Date();
    try {
      this.options.onAccepted?.({
        payload: sanitizeRecordedPayload(payload),
        receivedAt,
        state: structuredClone(state),
      });
    } catch (error) {
      console.error('[gsi] recording listener failed', error);
    }
    try {
      this.options.onState?.(structuredClone(state));
    } catch (error) {
      console.error('[gsi] onState listener failed', error);
    }

    sendText(res, 200, 'text/plain; charset=utf-8', 'ok');
  }
}

function authMatches(payload: unknown, expected: string | undefined): boolean {
  if (!expected) {
    return true;
  }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return false;
  }
  const auth = (payload as Record<string, unknown>).auth;
  if (typeof auth !== 'object' || auth === null || Array.isArray(auth)) {
    return false;
  }
  const token = (auth as Record<string, unknown>).token;
  if (typeof token !== 'string') {
    return false;
  }
  const actual = Buffer.from(token);
  const wanted = Buffer.from(expected);
  if (actual.length !== wanted.length) {
    return false;
  }
  return timingSafeEqual(actual, wanted);
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      reject(error);
    };
    const succeed = (value: string): void => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(value);
    };

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        fail(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      succeed(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', (error) => {
      fail(error);
    });
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  sendText(res, status, 'application/json; charset=utf-8', JSON.stringify(body));
}

function sendText(res: http.ServerResponse, status: number, type: string, body: string): void {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
  });
  res.end(body);
}
