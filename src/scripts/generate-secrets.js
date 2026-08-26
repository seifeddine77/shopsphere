#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Generates production secrets into .env.production.
 *
 *   node src/scripts/generate-secrets.js
 *
 * Creates .env.production with strong random JWT/COOKIE/MONGO secrets.
 * Never run it on a machine you do not trust, and never commit the file.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const secret = () => crypto.randomBytes(32).toString('hex');
const mongoKey = () => crypto.randomBytes(75).toString('base64'); // replica-set keyfile content

const template = `# PRODUCTION SECRETS - generated ${new Date().toISOString()}
# This file is gitignored. Rotate periodically and store a copy in your
# secret manager (GitHub Actions secrets, Vault, 1Password...).

NODE_ENV=production

JWT_SECRET=${secret()}
COOKIE_SECRET=${secret()}

# MongoDB replica-set internal auth key (mounted as /etc/mongo-keyfile)
MONGO_KEYFILE_CONTENT=${mongoKey()}

# Leave empty until you configure Stripe webhooks in the dashboard:
# https://dashboard.stripe.com/webhooks -> endpoint: /api/payments/stripe/webhook
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
`;

const target = path.join(__dirname, '../../.env.production');

if (fs.existsSync(target)) {
  console.error('REFUSING to overwrite existing .env.production.');
  console.error('Delete it manually if you really want new secrets.');
  process.exit(1);
}

fs.writeFileSync(target, template, { mode: 0o600 });
console.log(`Wrote ${target}`);
console.log('Next steps:');
console.log('  1. Add STRIPE_SECRET_KEY when ready');
console.log('  2. docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build');
