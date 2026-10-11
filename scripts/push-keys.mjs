// Creates the keys for push reminders, once: `npm run push:keys`.
//
// - Writes supabase/functions/.env.local (not committed) with VAPID_PUBLIC_KEY,
//   VAPID_PRIVATE_KEY, VAPID_SUBJECT and CRON_SECRET, for `supabase secrets set --env-file …`.
// - Prints the public key for VITE_VAPID_PUBLIC_KEY in .env.production (public by design).
//
// It never overwrites an existing file: new keys would cut off every phone that already
// subscribed. Delete the file first if you really want new keys.
import { createECDH, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../supabase/functions/.env.local', import.meta.url);
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

if (existsSync(file)) {
  const publicKey = /^VAPID_PUBLIC_KEY=(.+)$/m.exec(readFileSync(file, 'utf8'))?.[1];
  console.log('supabase/functions/.env.local already exists; keeping its keys.');
  console.log(`VITE_VAPID_PUBLIC_KEY=${publicKey}`);
  process.exit(0);
}

const ecdh = createECDH('prime256v1');
ecdh.generateKeys();
const publicKey = b64url(ecdh.getPublicKey());
writeFileSync(
  file,
  [
    '# Secrets for the send-reminders Edge Function. Never commit this file.',
    `VAPID_PUBLIC_KEY=${publicKey}`,
    `VAPID_PRIVATE_KEY=${b64url(ecdh.getPrivateKey())}`,
    'VAPID_SUBJECT=https://darkonaumovski.github.io/twins-mk/',
    `CRON_SECRET=${b64url(randomBytes(24))}`,
    '',
  ].join('\n'),
  { mode: 0o600 },
);
console.log('Wrote supabase/functions/.env.local (keep it private).');
console.log(`VITE_VAPID_PUBLIC_KEY=${publicKey}`);
