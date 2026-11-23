import type http from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import type { AppConfig } from './config';
import { authenticateUpgradeAsync } from './wsAuth';

interface Client {
  ws: WebSocket;
  userId: string;
  sessionId: string;
}

export interface RealtimeDeps {
  httpServer: http.Server;
  config: AppConfig;
  validateSession: (token: string | undefined) => Promise<{ id: string; userId: string } | null>;
  isSessionAlive: (sessionId: string) => Promise<boolean>;
  findUser: (id: string) => Promise<{ id: string; status?: string } | undefined>;
  getNotificationsFor: (userId: string) => Promise<unknown[]>;
}

const HEARTBEAT_MS = 30_000;

export function createRealtime(deps: RealtimeDeps) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const clients = new Map<WebSocket, Client>();

  const reject = (socket: Duplex, status: 401 | 403) => {
    if (socket.destroyed) return;
    const text = status === 401 ? 'Unauthorized' : 'Forbidden';
    socket.write(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
    socket.destroy();
  };

  deps.httpServer.on('upgrade', (request, socket, head) => {
    let pathname = '';
    try {
      pathname = new URL(request.url || '/', 'http://localhost').pathname;
    } catch {
      socket.destroy();
      return;
    }
    if (pathname !== '/ws') {
      socket.destroy();
      return;
    }

    void (async () => {
      const result = await authenticateUpgradeAsync(
        { origin: request.headers.origin, cookie: request.headers.cookie },
        {
          config: deps.config,
          validateSession: deps.validateSession,
          findUser: deps.findUser,
        }
      );
      if (socket.destroyed) return;
      if (!result.ok) {
        reject(socket, result.status);
        return;
      }

      const initialNotifications = await deps.getNotificationsFor(result.userId);
      if (socket.destroyed) return;

      wss.handleUpgrade(request, socket, head, (ws) => {
        clients.set(ws, { ws, userId: result.userId, sessionId: result.sessionId });
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'notifications:init', notifications: initialNotifications }));
        }

        // Identity is fixed at handshake. Client frames are never interpreted (no `auth`/`userId` switching).
        ws.on('message', () => {});
        ws.on('close', () => clients.delete(ws));
        ws.on('error', () => clients.delete(ws));
      });
    })().catch(() => {
      if (!socket.destroyed) socket.destroy();
    });
  });

  const emitToUser = (userId: string, payload: Record<string, unknown>) => {
    const raw = JSON.stringify(payload);
    for (const c of clients.values()) {
      if (c.userId === userId && c.ws.readyState === WebSocket.OPEN) c.ws.send(raw);
    }
  };

  const broadcast = (payload: Record<string, unknown>) => {
    const raw = JSON.stringify(payload);
    for (const c of clients.values()) {
      if (c.ws.readyState === WebSocket.OPEN) c.ws.send(raw);
    }
  };

  /** Closes every socket that belongs to a revoked/expired session. */
  const closeSessions = (sessionIds: string[]) => {
    const ids = new Set(sessionIds);
    for (const c of clients.values()) {
      if (ids.has(c.sessionId)) c.ws.close(4401, 'session ended');
    }
  };

  const heartbeat = setInterval(() => {
    void (async () => {
      for (const c of [...clients.values()]) {
        try {
          const [alive, user] = await Promise.all([
            deps.isSessionAlive(c.sessionId),
            deps.findUser(c.userId),
          ]);
          if (!alive || !user || user.status !== 'active') {
            c.ws.close(4401, 'session ended');
          } else if (c.ws.readyState === WebSocket.OPEN) {
            c.ws.ping();
          }
        } catch {
          // Keep existing connection until next heartbeat if a transient read error occurs.
        }
      }
    })();
  }, HEARTBEAT_MS);
  heartbeat.unref();

  const close = () => {
    clearInterval(heartbeat);
    for (const c of clients.values()) c.ws.terminate();
    clients.clear();
    wss.close();
  };

  return { emitToUser, broadcast, closeSessions, close, connectionCount: () => clients.size };
}
