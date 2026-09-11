import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
function getSecret(): string {
  const secret = process.env.ENCRYPTION_SECRET;
  if (!secret || secret.length < 32) throw new Error('ENCRYPTION_SECRET must be configured with at least 32 characters');
  return secret;
}

function getMasterKey(): Buffer {
  return crypto.createHash('sha256').update(getSecret()).digest();
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export class EncryptionService {
  public static encrypt(data: string | object): EncryptedPayload {
    const text = typeof data === 'object' ? JSON.stringify(data) : data;
    const iv = crypto.randomBytes(12);
    const masterKey = getMasterKey();

    const cipher = crypto.createCipheriv(ALGORITHM, masterKey, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');

    return {
      ciphertext: encrypted,
      iv: iv.toString('hex'),
      authTag,
    };
  }

  public static decrypt(payload: EncryptedPayload): string {
    const masterKey = getMasterKey();
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      masterKey,
      Buffer.from(payload.iv, 'hex')
    );

    decipher.setAuthTag(Buffer.from(payload.authTag, 'hex'));

    let decrypted = decipher.update(payload.ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  public static generateCsrfStateToken(brokerId: string, userId: string): string {
    if (!userId) throw new Error('Authenticated TradingCore user is required for OAuth state');
    const raw = JSON.stringify({
      brokerId,
      userId,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex'),
    });
    const enc = this.encrypt(raw);
    return Buffer.from(JSON.stringify(enc)).toString('base64url');
  }

  public static verifyCsrfStateToken(stateToken: string): { brokerId: string; userId: string; timestamp: number; nonce: string } | null {
    try {
      const decodedJson = Buffer.from(stateToken, 'base64url').toString('utf8');
      const payload: EncryptedPayload = JSON.parse(decodedJson);
      const decryptedStr = this.decrypt(payload);
      const parsed = JSON.parse(decryptedStr);

      if (!parsed?.brokerId || !parsed?.userId || !Number.isFinite(parsed?.timestamp) || !parsed?.nonce) return null;
      const age = Date.now() - parsed.timestamp;
      if (age > 15 * 60 * 1000 || age < -60_000) {
        console.warn('OAuth State token expired.');
        return null;
      }

      return parsed;
    } catch (err) {
      console.error('Failed to verify CSRF state token:', err);
      return null;
    }
  }
}
