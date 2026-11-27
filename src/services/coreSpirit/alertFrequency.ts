/** Pine alert frequency values shared by the realtime VM and host-owned alert outbox. */
export type CoreSpiritAlertFrequency='all'|'once-per-bar'|'once-per-bar-close';

/** Normalize documented Pine enum spelling and its internal kebab-case representation. */
export function normalizeCoreSpiritAlertFrequency(value:unknown):CoreSpiritAlertFrequency {
  const raw=String(value??'once-per-bar').trim().toLowerCase();
  const withoutPrefix=raw.startsWith('alert.freq_')?raw.slice('alert.freq_'.length):raw;
  const normalized=withoutPrefix.replaceAll('_','-');
  if(normalized==='all'||normalized==='once-per-bar'||normalized==='once-per-bar-close')return normalized;
  throw new Error(`Unsupported Pine alert frequency '${raw}'.`);
}
