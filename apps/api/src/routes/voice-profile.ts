import type { FastifyPluginAsync } from 'fastify';
import fs from 'fs';
import path from 'path';
import os from 'os';
import fetch from 'node-fetch';
import FormData from 'form-data';
import { db } from '../lib/db.js';
import type { FirebaseUser } from '../plugins/firebase-auth.js';
import { getTierLimits } from '../lib/subscription.js';

function requireUser(request: { firebaseUser?: FirebaseUser | null }): FirebaseUser {
  const user = request.firebaseUser;
  if (!user) {
    const err = new Error('Authentication required') as Error & { statusCode: number };
    err.statusCode = 401;
    throw err;
  }
  return user;
}

const DIARIZATION_SERVICE_URL = process.env.DIARIZATION_SERVICE_URL || '';

// ============================================
// Routes
// ============================================

export const voiceProfileRoutes: FastifyPluginAsync = async (fastify) => {
  // POST /api/voice-profile/enroll
  // Upload voice sample to create user's voice profile
  fastify.post('/api/voice-profile/enroll', async (request, reply) => {
    try {
      const { uid: userId } = requireUser(request);

      // Check if free user already has a voice profile (re-enrollment is Pro-only)
      const existingUser = await db.user.findUnique({
        where: { id: userId },
        select: { hasVoiceProfile: true, subscriptionTier: true },
      });
      if (existingUser?.hasVoiceProfile) {
        const limits = getTierLimits(existingUser.subscriptionTier);
        // Free tier: only 1 enrollment allowed. Re-enrollment requires Pro.
        if (limits.recordingsPerMonth !== null) {
          return reply.code(402).send({
            error: 'pro_required',
            message:
              'Re-enrolling your voice profile requires Twin Pro. Upgrade to update your voice.',
            tier: existingUser.subscriptionTier,
          });
        }
      }

      // Get uploaded file
      const data = await request.file();
      if (!data) {
        return reply.code(400).send({ error: 'No audio file provided' });
      }

      // Save to temp file
      const tmpPath = path.join(os.tmpdir(), `voice-${userId}-${Date.now()}.wav`);
      const buffer = await data.toBuffer();
      fs.writeFileSync(tmpPath, buffer);

      try {
        // Check audio duration (should be 10-30 seconds)
        // For simplicity, we'll accept any duration >= 5 seconds
        // TODO: Add actual duration check if needed

        // Extract speaker embedding using diarization service
        if (!DIARIZATION_SERVICE_URL) {
          throw new Error(
            'Voice profile enrollment is not available. The diarization service is not configured. Please set DIARIZATION_SERVICE_URL environment variable.'
          );
        }

        console.log(`👤 Extracting voice embedding for user ${userId}`);

        const form = new FormData();
        form.append('audio', fs.createReadStream(tmpPath));
        // Don't send segments - we just want the whole file embedding

        const response = await fetch(`${DIARIZATION_SERVICE_URL}/enroll`, {
          method: 'POST',
          body: form as any,
          headers: form.getHeaders(),
          timeout: 300000, // 5 minute timeout (model loading can be slow on first run)
        });

        if (!response.ok) {
          // Try to get error message from response
          let errorMessage = `Diarization service error: ${response.status}`;
          try {
            const contentType = response.headers.get('content-type') || '';
            if (contentType.includes('application/json')) {
              const errorData = await response.json();
              errorMessage = errorData.detail || errorData.message || errorMessage;
            } else {
              const errorText = await response.text();
              errorMessage = errorText || errorMessage;
            }
          } catch (e) {
            // If we can't parse the error, use the default message
            console.error('Failed to parse error response:', e);
          }
          throw new Error(errorMessage);
        }

        // Check content type before parsing JSON
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          const text = await response.text();
          throw new Error(
            `Diarization service returned non-JSON response: ${text.substring(0, 100)}`
          );
        }

        const result = (await response.json()) as { embedding: number[] };

        // Ensure user exists, then save embedding to database
        // Use upsert to create user if they don't exist
        const { email } = requireUser(request);
        await db.user.upsert({
          where: { id: userId },
          create: {
            id: userId,
            email: email || `${userId.slice(0, 20)}@local`,
            voiceEmbedding: result.embedding,
            hasVoiceProfile: true,
          },
          update: {
            voiceEmbedding: result.embedding,
            hasVoiceProfile: true,
          },
        });

        console.log(`✅ Voice profile enrolled for user ${userId}`);

        return {
          success: true,
          message: 'Voice profile enrolled successfully',
          hasVoiceProfile: true,
        };
      } finally {
        // Clean up temp file
        if (fs.existsSync(tmpPath)) {
          fs.unlinkSync(tmpPath);
        }
      }
    } catch (error) {
      console.error('❌ Voice enrollment failed:', error);
      return reply.code(500).send({
        error: error instanceof Error ? error.message : 'Voice enrollment failed',
      });
    }
  });

  // DELETE /api/voice-profile
  // Remove user's voice profile
  fastify.delete('/api/voice-profile', async (request, _reply) => {
    const { uid: userId } = requireUser(request);

    // Use updateMany to avoid error if user doesn't exist
    await db.user.updateMany({
      where: { id: userId },
      data: {
        voiceEmbedding: undefined,
        hasVoiceProfile: false,
      },
    });

    return {
      success: true,
      message: 'Voice profile deleted successfully',
    };
  });

  // GET /api/voice-profile/status
  // Check if user has a voice profile
  fastify.get('/api/voice-profile/status', async (request, _reply) => {
    const { uid: userId } = requireUser(request);

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { hasVoiceProfile: true },
    });

    return {
      hasVoiceProfile: user?.hasVoiceProfile || false,
    };
  });
};
