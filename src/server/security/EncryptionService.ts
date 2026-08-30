import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const DEFAULT_KEY_STRING = process.env.ENCRYPTION_SECRET || 'tradingcore_os_master_secret_key_32bytes!!';

// Ensure key is exactly 32 bytes for AES-256
function getMasterKey(): Buffer {
  return crypto.createHash('sha256').update(DEFAULT_KEY_STRING).digest();
}

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  authTag: string;
}

export class EncryptionService {
  /**
   * Encrypts plain text or sensitive JSON using AES-256-GCM
   */
  public static encrypt(data: string | object): EncryptedPayload {
    const text = typeof data === 'object' ? JSON.stringify(data) : data;
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
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

  /**
   * Decrypts AES-256-GCM encrypted payload back to plain text
   */
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

  /**
   * Generates a cryptographically secure random CSRF state token
   */
  public static generateCsrfStateToken(brokerId: string, userId: string = 'anonymous'): string {
    const raw = JSON.stringify({
      brokerId,
      userId,
      timestamp: Date.now(),
      nonce: crypto.randomBytes(16).toString('hex'),
    });
    const enc = this.encrypt(raw);
    return Buffer.from(JSON.stringify(enc)).toString('base64url');
  }

  /**
   * Validates and parses CSRF state token
   */
  public static verifyCsrfStateToken(stateToken: string): { brokerId: string; userId: string; timestamp: number } | null {
    try {
      const decodedJson = Buffer.from(stateToken, 'base64url').toString('utf8');
      const payload: EncryptedPayload = JSON.parse(decodedJson);
      const decryptedStr = this.decrypt(payload);
      const parsed = JSON.parse(decryptedStr);

      // Verify token age (max 15 minutes)
      if (Date.now() - parsed.timestamp > 15 * 60 * 1000) {
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
