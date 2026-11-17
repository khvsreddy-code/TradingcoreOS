#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function requiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`Missing required GitHub Actions secret/variable: ${name}`);
  return value;
}

const appUrl = new URL(requiredEnv('TCO_BROWSER_BASE_URL'));
if (appUrl.protocol !== 'https:' && appUrl.hostname !== 'localhost') {
  throw new Error('TCO_BROWSER_BASE_URL must use HTTPS (localhost is allowed for isolated testing).');
}

const supabaseUrl = requiredEnv('TCO_BROWSER_SUPABASE_URL').replace(/\/$/, '');
const supabaseKey = requiredEnv('TCO_BROWSER_SUPABASE_PUBLISHABLE_KEY');
const email = requiredEnv('TCO_BROWSER_TEST_EMAIL');
const password = requiredEnv('TCO_BROWSER_TEST_PASSWORD');
const stateFile = resolve(requiredEnv('TCO_BROWSER_STATE_FILE'));

const persistedValues = new Map();
const storage = {
  getItem: (key) => persistedValues.get(key) ?? null,
  setItem: (key, value) => { persistedValues.set(key, value); },
  removeItem: (key) => { persistedValues.delete(key); },
};

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage,
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) {
  throw new Error(`Supabase CI test-account sign-in failed: ${error.message}`);
}
if (!data.session?.access_token || !data.session?.refresh_token || !data.user?.id) {
  throw new Error('Supabase did not issue a complete session. Check that the CI test account is confirmed and is not blocked by MFA.');
}

const localStorage = [...persistedValues.entries()].map(([name, value]) => ({ name, value }));
const sessionEntry = localStorage.find(({ name, value }) => {
  if (!/auth-token$/i.test(name)) return false;
  try {
    const stored = JSON.parse(value);
    return stored?.access_token === data.session.access_token &&
      stored?.user?.id === data.user.id;
  } catch {
    return false;
  }
});

if (!sessionEntry) {
  throw new Error('Supabase session was not persisted under the expected browser storage key; refusing to launch an unauthenticated performance run.');
}

const state = {
  cookies: [],
  origins: [{
    origin: appUrl.origin,
    localStorage,
  }],
};

await mkdir(dirname(stateFile), { recursive: true });
await writeFile(stateFile, JSON.stringify(state), { mode: 0o600 });
await chmod(stateFile, 0o600);

console.log(`Created ephemeral Supabase browser state for ${appUrl.origin} (${localStorage.length} local-storage entr${localStorage.length === 1 ? 'y' : 'ies'}). Credentials and tokens were not logged.`);
