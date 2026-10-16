import { Router, type Request, type Response } from 'express';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { getErrorMessage, isRecord } from '../../services/boundary/brokerApiValidation.js';
import { canonicalSha256 } from '../utils/canonicalJson.js';
import { AutomationIntegrationRepository } from '../automation/AutomationIntegrationRepository.js';
import { AuditLogRepository } from '../storage/AuditLogRepository.js';

export const automationSignalIngestRoutes = Router();

const SYMBOL_PATTERN = /^[A-Z0-9_-]{2,16}:[A-Z0-9&_.-]{1,80}$/;
const EVENT_TYPES = new Set(['BUY','SELL','LONG','SHORT','EXIT','ALERT','CUSTOM','BUY_CE','BUY_PE','SELL_CE','SELL_PE']);

function timingSafeEqualHex(left: string, right: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  const a = Buffer.from(left, 'hex');
  const b = Buffer.from(right, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

function fail(res: Response, status: number, error: string) {
  return res.status(status).json({ success: false, error });
}

/**
 * Server-to-server CoreSpirit signal ingress. The signing secret must remain in
 * trusted server execution only; it is deliberately not the automation token and
 * is never exposed to the browser or passed to the external AI workflow.
 *
 * Signature: HMAC_SHA256(secret, "<epoch-ms>\n" + canonical SHA-256 of JSON body).
 * Event-ID uniqueness makes safe retries idempotent.
 */
automationSignalIngestRoutes.post('/internal/v1/signals', async (req: Request, res: Response) => {
  const secret = process.env.TCO_CORESPIRIT_SIGNAL_SECRET;
  if (!secret || secret.length < 32) return fail(res, 503, 'Trusted CoreSpirit signal ingress is not configured.');
  if (!isRecord(req.body) || Buffer.byteLength(JSON.stringify(req.body), 'utf8') > 8_192) {
    return fail(res, 413, 'Signal payload must be a JSON object no larger than 8 KiB.');
  }
  const timestampHeader = String(req.get('x-tco-signal-timestamp') ?? '');
  const signature = String(req.get('x-tco-signal-signature') ?? '');
  const timestamp = Number(timestampHeader);
  if (!/^\d{13}$/.test(timestampHeader) || !Number.isFinite(timestamp) || Math.abs(Date.now() - timestamp) > 60_000) {
    return fail(res, 401, 'Signal signature timestamp is invalid or expired.');
  }
  const expected = createHmac('sha256', secret)
    .update(`${timestampHeader}\n${canonicalSha256(req.body)}`)
    .digest('hex');
  if (!timingSafeEqualHex(signature, expected)) return fail(res, 401, 'Trusted CoreSpirit signal signature is invalid.');

  const integrationId = String(req.body.integrationId ?? '').trim();
  const eventId = String(req.body.eventId ?? '').trim();
  const eventType = String(req.body.eventType ?? req.body.type ?? '').trim().toUpperCase();
  const symbol = String(req.body.symbol ?? '').trim().toUpperCase();
  const sourceId = String(req.body.sourceId ?? '').trim();
  const runId = String(req.body.runId ?? '').trim();
  const timeframe = String(req.body.timeframe ?? '').trim();
  const programChecksum = String(req.body.programChecksum ?? '').trim().toLowerCase();
  const barIndex = Number(req.body.barIndex ?? -1);
  const signalTimestamp = Number(req.body.timestamp);
  const mode = String(req.body.mode ?? '').trim().toLowerCase();
  if (!/^[0-9a-f-]{36}$/i.test(integrationId)) return fail(res, 400, 'integrationId must be a valid UUID.');
  if (!eventId || eventId.length > 200) return fail(res, 400, 'eventId must contain 1–200 characters.');
  if (!EVENT_TYPES.has(eventType)) return fail(res, 400, 'Unsupported CoreSpirit signal type.');
  if (!SYMBOL_PATTERN.test(symbol)) return fail(res, 400, 'Signal symbol must be fully-qualified.');
  if (!sourceId || sourceId.length > 200 || !runId || runId.length > 200 || timeframe.length > 32) return fail(res, 400, 'Signal source, run ID, or timeframe is invalid.');
  if (!/^[a-f0-9]{8,128}$/.test(programChecksum)) return fail(res, 400, 'A valid compiled CoreSpirit program checksum is required for trusted signal ingress.');
  if (!Number.isSafeInteger(barIndex) || barIndex < -1) return fail(res, 400, 'barIndex must be an integer greater than or equal to -1.');
  if (mode !== 'realtime') return fail(res, 422, 'Trusted live signal ingress accepts realtime signals only.');
  if (!Number.isFinite(signalTimestamp) || signalTimestamp < Date.now() - 120_000 || signalTimestamp > Date.now() + 2_000) {
    return fail(res, 422, 'Live signal timestamp must be recent epoch milliseconds (at most two minutes old).');
  }
  const payload = req.body.payload === undefined ? {} : req.body.payload;
  if (!isRecord(payload) || Buffer.byteLength(JSON.stringify(payload), 'utf8') > 8_192) return fail(res, 413, 'Signal metadata must be a JSON object no larger than 8 KiB.');

  try {
    const integration = await AutomationIntegrationRepository.getById(integrationId);
    if (!integration || integration.revokedAt || Date.parse(integration.expiresAt) <= Date.now()) {
      return fail(res, 403, 'Active automation integration was not found.');
    }
    const result = await AutomationIntegrationRepository.publishSignal({
      userId: integration.userId,
      integrationId,
      eventId,
      eventType,
      symbol,
      timeframe,
      sourceId,
      runId,
      mode,
      barIndex,
      timestamp: signalTimestamp,
      payload: { ...payload, programChecksum },
      trustedProducer: true,
    });
    if (result.conflict) return fail(res, 409, 'This eventId was already published with a different payload.');
    if (result.inserted) {
      await AuditLogRepository.append({
        userId: integration.userId,
        actorType: 'automation',
        eventType: 'automation.signal.ingested',
        correlationId: eventId,
        payload: { integrationId, eventId, eventType, symbol, mode, programChecksum },
      });
    }
    return res.status(result.inserted ? 201 : 200).json({
      success: true,
      data: { eventId, duplicate: !result.inserted, stored: true, createdAt: result.signal.createdAt },
    });
  } catch (error) {
    const message = getErrorMessage(error, 'Unable to ingest trusted CoreSpirit signal.');
    const status = /active integration|allowlist/i.test(message) ? 403 : 503;
    return fail(res, status, message);
  }
});
