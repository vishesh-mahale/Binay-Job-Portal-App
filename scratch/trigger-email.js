const { DatabaseService } = require('../04-nestjs-api/04-nestjs-api-app/dist/src/infrastructure/database/database');
const { SystemClient } = require('../04-nestjs-api/04-nestjs-api-app/dist/src/infrastructure/database/clients');
const { OutboxWorkerService, BrevoEmailService } = require('../04-nestjs-api/04-nestjs-api-app/dist/src/modules/identity/outbox-worker');
const fs = require('fs');

const env = fs.readFileSync('./04-nestjs-api/04-nestjs-api-app/.env', 'utf8');
const envVars = {};
env.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    process.env[match[1].trim()] = match[2].trim();
    envVars[match[1].trim()] = match[2].trim();
  }
});

async function main() {
  const dbService = new DatabaseService(envVars);
  const db = new SystemClient(dbService);

  const emailService = new BrevoEmailService();
  const worker = new OutboxWorkerService(db, emailService);

  await db.query("UPDATE public.outbox_events SET status='pending', available_at=NOW() WHERE aggregate_id='39c89793-ecdd-4473-8037-be9b5ffba255'");
  console.log('Reset outbox event status to pending.');

  const res = await worker.processPendingInvitations();
  console.log('Process Result:', res);
  console.log('Last Message ID:', emailService.lastMessageId);
  await dbService.onModuleDestroy();
}

main().catch(err => {
  console.error('Scratch Error:', err);
  process.exit(1);
});
