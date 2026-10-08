import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_SECRET = 'c'.repeat(64);
process.env.TRADINGCORE_ALLOW_IN_MEMORY_SESSIONS = 'true';

const { BrokerRepository } = await import('./src/server/storage/BrokerRepository.ts');
const { EncryptionService } = await import('./src/server/encryption/EncryptionService.ts');

const brokerId = 'fyers';
const userId = 'token-cache-contract';
const accessToken = 'contract-access-token';
const encrypted = EncryptionService.encrypt(accessToken);

let decryptCalls = 0;
const originalDecrypt = EncryptionService.decrypt;
EncryptionService.decrypt = ((payload) => {
  decryptCalls += 1;
  return originalDecrypt.call(EncryptionService, payload);
});

try {
  await BrokerRepository.saveSession({
    brokerId,
    userId,
    accessTokenEncrypted: encrypted,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    status: 'Connected',
    connectedAt: new Date().toISOString(),
  });

  assert.equal(await BrokerRepository.getAccessTokenForExecution(brokerId, userId), accessToken);
  assert.equal(await BrokerRepository.getAccessTokenForExecution(brokerId, userId), accessToken);
  assert.equal(decryptCalls, 1, 'the decrypted token should be reused within the execution-cache TTL');

  await BrokerRepository.updateStatus(brokerId, userId, 'Disconnected');
  assert.equal(await BrokerRepository.getAccessTokenForExecution(brokerId, userId), undefined, 'revocation/status change must invalidate the token fast path');

  await BrokerRepository.saveSession({
    brokerId,
    userId,
    accessTokenEncrypted: encrypted,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    status: 'Connected',
    connectedAt: new Date().toISOString(),
  });

  assert.equal(await BrokerRepository.getAccessTokenForExecution(brokerId, userId), accessToken);
  await BrokerRepository.deleteSession(brokerId, userId);
  assert.equal(await BrokerRepository.getAccessTokenForExecution(brokerId, userId), undefined, 'session deletion must invalidate the token fast path');
} finally {
  EncryptionService.decrypt = originalDecrypt;
  await BrokerRepository.deleteSession(brokerId, userId).catch(() => undefined);
}

console.log('FYERS_EXECUTION_TOKEN_CACHE_CONTRACT_OK');
