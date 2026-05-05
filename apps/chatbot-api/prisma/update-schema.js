const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

// Load .env
const envPath = path.join(__dirname, 'apps/chatbot-api/.env');
const env = {};
try {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    const value = valueParts.join('=');
    if (key && value) {
      env[key.trim()] = value.trim().replace(/^"|"$/g, '');
    }
  });
} catch (e) {
  console.log('No .env found, using default connection');
}

async function updateSchema() {
  const client = new Client({ connectionString: env.DATABASE_URL || 'postgresql://postgres:mysecretpassword@localhost:5433/postgres' });
  await client.connect();

  console.log('Updating schema manually...');
  try {
    await client.query('ALTER TABLE "Area" ADD COLUMN IF NOT EXISTS "name" TEXT DEFAULT \'Unnamed Area\'');
    await client.query('ALTER TABLE "Area" ADD COLUMN IF NOT EXISTS "color" TEXT DEFAULT \'#3b82f6\'');
    console.log('Schema updated successfully.');
  } catch (e) {
    console.error('Failed to update schema:', e);
  }

  await client.end();
}

updateSchema().catch(console.error);
