import { EncryptedPayload } from '../encryption/EncryptionService.js';

export interface BrokerSessionRecord {
  brokerId: string;
  userId: string;
  accessTokenEncrypted: EncryptedPayload;
  refreshTokenEncrypted?: EncryptedPayload;
  expiresAt: string;
  status: 'Connected' | 'Expired' | 'Disconnected';
  connectedAt: string;
  clientCode?: string;
}

export class BrokerRepository {
  private static store: Map<string, BrokerSessionRecord> = new Map();

  public static saveSession(session: BrokerSessionRecord): void {
    const key = `${session.userId}:${session.brokerId.toLowerCase()}`;
    this.store.set(key, session);
  }

  public static getSession(brokerId: string, userId: string = 'default_user'): BrokerSessionRecord | undefined {
    const key = `${userId}:${brokerId.toLowerCase()}`;
    return this.store.get(key);
  }

  public static getUserSessions(userId: string = 'default_user'): BrokerSessionRecord[] {
    const list: BrokerSessionRecord[] = [];
    this.store.forEach((session) => {
      if (session.userId === userId) {
        list.push(session);
      }
    });
    return list;
  }

  public static deleteSession(brokerId: string, userId: string = 'default_user'): boolean {
    const key = `${userId}:${brokerId.toLowerCase()}`;
    return this.store.delete(key);
  }
}
