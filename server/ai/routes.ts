import express from 'express';
import { AiAssistantService, AiServiceError } from './service';

function resolveActorIdentity(req: express.Request): { actorKey: string; isAuthenticated: boolean } {
  if (req.auth?.user?.id) {
    return { actorKey: String(req.auth.user.id), isAuthenticated: true };
  }
  const ip = (req.ip || req.socket?.remoteAddress || 'unknown').trim() || 'unknown';
  return { actorKey: ip, isAuthenticated: false };
}

export function createAiRouter(service: AiAssistantService): express.Router {
  const router = express.Router();

  router.get('/status', (req, res) => {
    const { actorKey, isAuthenticated } = resolveActorIdentity(req);
    res.json(service.getStatus(actorKey, isAuthenticated));
  });

  router.post('/chat', async (req, res, next) => {
    try {
      const { actorKey, isAuthenticated } = resolveActorIdentity(req);
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const result = await service.chat({
        actorKey,
        isAuthenticated,
        message: (body as { message?: unknown }).message,
        history: (body as { history?: unknown }).history,
      });
      res.json(result);
    } catch (err) {
      if (err instanceof AiServiceError) {
        if (err.retryAfterSeconds) {
          res.setHeader('Retry-After', String(err.retryAfterSeconds));
        }
        return res.status(err.status).json({
          error: err.message,
          code: err.code,
          ...(err.retryAfterSeconds ? { retryAfterSeconds: err.retryAfterSeconds } : {}),
        });
      }
      next(err);
    }
  });

  return router;
}
