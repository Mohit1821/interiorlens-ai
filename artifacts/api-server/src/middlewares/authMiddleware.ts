import type { AuthUser } from '@workspace/api-zod';
import { type NextFunction, type Request, type Response } from 'express';
import * as oidc from 'openid-client';
import crypto from 'node:crypto';

import {
  clearSession,
  getOidcConfig,
  getSession,
  getSessionId,
  updateSession,
  type SessionData,
} from '../lib/auth';

declare global {
  namespace Express {
    interface User extends AuthUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;

      user?: User | undefined;
    }

    export interface AuthedRequest {
      user: User;
    }
  }
}

async function refreshIfExpired(
  sid: string,
  session: SessionData,
): Promise<SessionData | null> {
  const now = Math.floor(Date.now() / 1000);
  if (!session.expires_at || now <= session.expires_at) return session;

  if (!session.refresh_token) return null;

  try {
    const config = await getOidcConfig();
    const tokens = await oidc.refreshTokenGrant(config, session.refresh_token);
    session.access_token = tokens.access_token;
    session.refresh_token = tokens.refresh_token ?? session.refresh_token;
    session.expires_at = tokens.expiresIn()
      ? now + tokens.expiresIn()!
      : session.expires_at;
    await updateSession(sid, session);
    return session;
  } catch {
    return null;
  }
}

export async function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request['isAuthenticated'];

  const sid = getSessionId(req);
  if (sid) {
    const session = await getSession(sid);
    if (session?.user?.id) {
      if (session.access_token === 'local_pwd') {
        req.user = session.user;
      } else {
        const refreshed = await refreshIfExpired(sid, session);
        if (refreshed) {
          req.user = refreshed.user;
        } else {
          await clearSession(res, sid);
        }
      }
    } else {
      await clearSession(res, sid);
    }
  }

  // If not logged in via OIDC, assign a persistent Guest user
  if (!req.user) {
    let guestId = req.cookies?.guest_session;
    if (!guestId) {
      guestId = `guest_${crypto.randomUUID().slice(0, 12)}`;
      res.cookie('guest_session', guestId, {
        httpOnly: true,
        maxAge: 30 * 24 * 60 * 60 * 1000,
        path: '/',
        sameSite: 'lax',
      });
    }
    req.user = {
      id: guestId,
      email: null,
      firstName: 'Guest',
      lastName: 'User',
      profileImageUrl: null,
    };
  }

  next();
}
