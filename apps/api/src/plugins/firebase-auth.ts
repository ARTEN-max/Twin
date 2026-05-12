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
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { isProduction } from '../lib/env.js';

// ── Firebase Admin lazy-init ─────────────────────────────────

let _adminAuth: FirebaseAdmin.auth.Auth | null = null;
let _initAttempted = false;

function parseServiceAccountJson(rawValue: string): FirebaseAdmin.ServiceAccount {
  const attempts: string[] = [];
  let normalized = rawValue.trim();
  attempts.push(normalized);

  // Some secret UIs wrap JSON in an extra quoted layer.
  if (
    (normalized.startsWith('"') && normalized.endsWith('"')) ||
    (normalized.startsWith("'") && normalized.endsWith("'"))
  ) {
    try {
      const unwrapped = JSON.parse(normalized) as string;
      if (typeof unwrapped === 'string') {
        normalized = unwrapped.trim();
        attempts.push(normalized);
      }
    } catch {
      // Fall through to later attempts.
    }
  }

  // Repair malformed JSON where the private key contains literal newlines.
  const repairedPrivateKey = normalized.replace(
    /"private_key"\s*:\s*"([\s\S]*?)",\s*"client_email"/,
    (_match, privateKey) =>
      `"private_key":"${String(privateKey).replace(/\r?\n/g, '\\n')}","client_email"`
  );
  if (repairedPrivateKey !== normalized) {
    attempts.push(repairedPrivateKey);
  }

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      return JSON.parse(attempt) as FirebaseAdmin.ServiceAccount;
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
}

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
    // Parse optional service account JSON
    const saJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    let credential: FirebaseAdmin.credential.Credential | undefined;

    if (saJson) {
      try {
        const serviceAccount = parseServiceAccountJson(saJson);
        credential = cert(serviceAccount);
      } catch (err) {
        console.warn('⚠️  Could not initialize FIREBASE_SERVICE_ACCOUNT_JSON credential:', err);
        if (isProduction()) {
          throw err;
        }
      }
    }

    const app =
      getApps().length > 0
        ? getApps()[0]!
        : initializeApp({
            projectId,
            ...(credential ? { credential } : {}),
          });

    _adminAuth = getAuth(app);
    console.log(`🔐 Firebase Auth enabled (project: ${projectId})`);
    return _adminAuth;
  } catch (err) {
    console.error('❌ Failed to initialise Firebase Admin:', err);
    if (isProduction()) {
      throw err;
    }
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
export async function registerFirebaseAuth(app: FastifyInstance): Promise<void> {
  // Eagerly try to init so we log once at startup
  const adminAuth = await getFirebaseAuth();
  const allowLegacyHeaderAuth = !isProduction();

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
      if (!allowLegacyHeaderAuth) {
        return reply.status(500).send({
          error: 'AuthConfigurationError',
          message: 'Server authentication is not configured correctly.',
        });
      }

      // ── Firebase NOT configured – legacy x-user-id mode outside production only ─
      const headerUserId = request.headers['x-user-id'] as string | undefined;
      if (headerUserId) {
        request.firebaseUser = {
          uid: headerUserId,
          email: '',
        };
      }
      // If no header either, individual routes decide whether to 401
    }
  });
}
