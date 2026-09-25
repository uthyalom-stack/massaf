import { db } from '@/lib/db';
import { SessionPayload } from '@/lib/auth-session';

export interface LogAdminActionParams {
  session: SessionPayload;
  action: string;
  entityType: string;
  entityId?: string | null;
  description: string;
  metadata?: Record<string, unknown>;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'password_hash',
  'token',
  'tokenhash',
  'cardcode',
  'card_code',
  'pin',
  'secret',
  'authsecret',
  'cronsecret',
]);

function sanitizeMetadata(obj: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_KEYS.has(lowerKey)) {
      clean[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      clean[key] = sanitizeMetadata(value as Record<string, unknown>);
    } else {
      clean[key] = value;
    }
  }
  return clean;
}

export async function logAdminAction(params: LogAdminActionParams): Promise<void> {
  try {
    const cleanMeta = params.metadata ? sanitizeMetadata(params.metadata) : undefined;
    const metadataJson = cleanMeta ? JSON.stringify(cleanMeta) : null;

    await db.adminAuditLog.create({
      data: {
        actorUserId: params.session.entityId !== 'env-admin' ? params.session.entityId : null,
        actorEmail: params.session.email,
        actorRole: params.session.role || 'ADMIN',
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId || null,
        description: params.description,
        metadataJson,
      },
    });
  } catch (err) {
    console.error('[logAdminAction] Error creating audit log entry:', err);
    // Error isolation: Audit logging failure should not abort primary administrative actions
  }
}
