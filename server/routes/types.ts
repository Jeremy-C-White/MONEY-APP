import type express from 'express';
import type { Firestore, Timestamp } from 'firebase-admin/firestore';

export type RouteInfrastructure = {
  requireAuth: express.RequestHandler;
  db: Firestore;
  now: () => Timestamp;
};

export type AuthenticatedRequest = express.Request & {
  user: { uid: string };
};

export function authenticatedUserId(req: express.Request): string {
  return (req as AuthenticatedRequest).user.uid;
}
