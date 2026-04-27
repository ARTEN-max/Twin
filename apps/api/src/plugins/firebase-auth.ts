/**
 * Firebase Auth Middleware
 *
 * Verifies Firebase ID tokens on protected routes and sets `request.firebaseUser`.
 *
 * Behavior:
 * - If FIREBASE_PROJECT_ID is set → require a valid Bearer token on all
 *   non-health routes.  Falls back to x-user-id header for local dev.
 * - If FIREBASE_PROJECT_ID is NOT set → use x-user-id header only (existing
 *   mock-auth behaviour so nothing breaks for devs who haven't set up Firebase).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type * as FirebaseAdmin from 'firebase-admin';

// ── Firebase Admin lazy-init ─────────────────────────────────

let _adminAuth: FirebaseAdmin.auth.Auth | null = null;
let _initAttempted = false;

async function getFirebaseAuth(): Promise<FirebaseAdmin.auth.Auth | null> {
  if (_initAttempted) return _adminAuth;
  _initAttempted = true;

  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    console.log(
      'ℹ️  FIREBASE_PROJECT_ID not set – Firebase auth disabled (using x-user-id header)'
    );
    return null;
  }

  try {
    const admin = await import('firebase-admin');

    // Parse optional service account JSON
    const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    let credential: FirebaseAdmin.credential.Credential | undefined;

    if (saJson) {
      try {
        const serviceAccount = JSON.parse(saJson);
        credential = admin.credential.cert(serviceAccount);
      } catch {
        console.warn('⚠️  Could not parse FIREBASE_SERVICE_ACCOUNT_JSON – falling back to ADC');
      }
    }

    const app =
      admin.apps.length > 0
        ? admin.apps[0]!
        : admin.initializeApp({
            projectId,
            ...(credential ? { credential } : {}),
          });

    _adminAuth = app.auth();
    console.log(`🔐 Firebase Auth enabled (project: ${projectId})`);
    return _adminAuth;
  } catch (err) {
    console.error('❌ Failed to initialise Firebase Admin:', err);
    return null;
  }
}

// ── Fastify types augmentation ───────────────────────────────

export interface FirebaseUser {
  uid: string;
  email: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    firebaseUser?: FirebaseUser | null;
  }
}

// ── Plugin ───────────────────────────────────────────────────

const UNPROTECTED_PREFIXES = ['/api/health', '/api/ready'];
const allowLegacyHeaderAuth = process.env.NODE_ENV !== 'production';

export async function registerFirebaseAuth(app: FastifyInstance): Promise<void> {
  // Eagerly try to init so we log once at startup
  const adminAuth = await getFirebaseAuth();

  app.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip auth for health / readiness probes
    if (UNPROTECTED_PREFIXES.some((p) => request.url.startsWith(p))) {
      return;
    }

    if (adminAuth) {
      // ── Firebase is configured ──────────────────────────
      const authHeader = request.headers.authorization;

      if (authHeader?.startsWith('Bearer ')) {
        const idToken = authHeader.slice(7);
        try {
          const decoded = await adminAuth.verifyIdToken(idToken);
          request.firebaseUser = {
            uid: decoded.uid,
            email: decoded.email ?? '',
          };
          return; // ✅ authenticated via Firebase
        } catch {
          return reply.status(401).send({
            error: 'Unauthorized',
            message: 'Invalid or expired authentication token',
          });
        }
      }

      // Fall back to x-user-id only outside production so local tools can
      // keep working without Firebase admin credentials.
      const headerUserId = request.headers['x-user-id'] as string | undefined;
      if (allowLegacyHeaderAuth && headerUserId) {
        request.firebaseUser = {
          uid: headerUserId,
          email: '',
        };
        return;
      }

      // No credentials at all → 401
      return reply.status(401).send({
        error: 'Unauthorized',
        message: allowLegacyHeaderAuth
          ? 'Authentication required. Provide a Bearer token or x-user-id header.'
          : 'Authentication required. Provide a valid Bearer token.',
      });
    } else {
      // ── Firebase NOT configured – legacy x-user-id mode outside production only ─
      const headerUserId = request.headers['x-user-id'] as string | undefined;
      if (allowLegacyHeaderAuth && headerUserId) {
        request.firebaseUser = {
          uid: headerUserId,
          email: '',
        };
      }
      // If no header either, individual routes decide whether to 401
    }
  });
}
