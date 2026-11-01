// Run locally once. Store the private key only in Supabase Edge Function secrets.
const {createECDH,randomBytes}=require('node:crypto');
const key=createECDH('prime256v1');key.generateKeys();
console.log('VAPID_PUBLIC_KEY='+key.getPublicKey().toString('base64url'));
console.log('VAPID_PRIVATE_KEY='+key.getPrivateKey().toString('base64url'));
console.log('NOTIFICATIONS_CRON_SECRET='+randomBytes(32).toString('base64url'));
