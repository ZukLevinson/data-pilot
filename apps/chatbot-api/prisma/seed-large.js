const { Client } = require('pg');
const { OpenAIEmbeddings } = require('@langchain/openai');
const { randomUUID } = require('crypto');
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
  console.log('No .env found, using defaults');
}

const TYPES = ['point', 'circle', 'open polygon', 'closed polygon', 'corridor', 'ellipse'];
const REGIONS = [
  { name: 'Israel', minLon: 34.0, maxLon: 36.0, minLat: 29.5, maxLat: 33.5 },
  { name: 'France', minLon: -5.0, maxLon: 8.0, minLat: 42.0, maxLat: 51.0 },
  { name: 'Sea (Mediterranean)', minLon: 20.0, maxLon: 34.0, minLat: 32.0, maxLat: 35.0 }
];

const COLORS = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#3b82f6', '#6366f1', '#8b5cf6', '#d946ef'];

function generateWkt(type, region) {
  const lon = parseFloat((Math.random() * (region.maxLon - region.minLon) + region.minLon).toFixed(6));
  const lat = parseFloat((Math.random() * (region.maxLat - region.minLat) + region.minLat).toFixed(6));
  
  switch(type) {
    case 'point': return `POINT(${lon} ${lat})`;
    case 'circle': return `POINT(${lon} ${lat})`;
    case 'open polygon': return `LINESTRING(${lon} ${lat}, ${(lon+0.05).toFixed(6)} ${(lat+0.05).toFixed(6)})`;
    case 'closed polygon': 
      return `POLYGON((${lon} ${lat}, ${(lon+0.02).toFixed(6)} ${lat}, ${(lon+0.02).toFixed(6)} ${(lat+0.02).toFixed(6)}, ${lon} ${(lat+0.02).toFixed(6)}, ${lon} ${lat}))`;
    case 'corridor': return `LINESTRING(${lon} ${lat}, ${(lon+0.1).toFixed(6)} ${(lat+0.1).toFixed(6)})`;
    case 'ellipse': 
      return `POLYGON((${lon} ${lat}, ${(lon+0.02).toFixed(6)} ${(lat+0.01).toFixed(6)}, ${(lon+0.01).toFixed(6)} ${(lat+0.02).toFixed(6)}, ${(lon-0.01).toFixed(6)} ${(lat+0.01).toFixed(6)}, ${lon} ${lat}))`;
    default: return `POINT(${lon} ${lat})`;
  }
}

async function seed() {
  const client = new Client({ connectionString: env.DATABASE_URL || 'postgresql://postgres:mysecretpassword@localhost:5433/postgres' });
  await client.connect();

  await client.query('DELETE FROM "Area"');

  const embeddings = new OpenAIEmbeddings({
    modelName: 'nomic-embed-text',
    apiKey: 'local-key',
    configuration: { baseURL: env.LOCAL_LLM_URL || 'http://localhost:11434/v1' },
  });

  console.log('Generating base embeddings for regions...');
  const regionalEmbeddings = {};
  for (const region of REGIONS) {
    try {
      regionalEmbeddings[region.name] = await embeddings.embedQuery(`ישות גיאוגרפית הנמצאת באזור ${region.name}`);
    } catch (e) {
      console.warn(`Failed for ${region.name}, using random.`);
      regionalEmbeddings[region.name] = Array.from({ length: 768 }, () => Math.random() * 2 - 1);
    }
  }

  const TOTAL_ROWS = 25000;
  const BATCH_SIZE = 100;
  
  console.log(`Reseeding ${TOTAL_ROWS} rows with name and color...`);

  for (let i = 0; i < TOTAL_ROWS; i += BATCH_SIZE) {
    const values = [];
    const params = [];
    
    for (let j = 0; j < BATCH_SIZE && (i + j) < TOTAL_ROWS; j++) {
      const type = TYPES[Math.floor(Math.random() * TYPES.length)];
      const region = REGIONS[Math.floor(Math.random() * REGIONS.length)];
      const id = randomUUID();
      const wkt = generateWkt(type, region);
      const name = `${type.charAt(0).toUpperCase() + type.slice(1)} ${region.name.split(' ')[0]} #${i + j + 1}`;
      const color = COLORS[Math.floor(Math.random() * COLORS.length)];
      const content = `ישות גיאוגרפי בשם "${name}" מסוג ${type}. מיקום: ${region.name}. צבע: ${color}. WKT: ${wkt}`;
      
      const baseVector = regionalEmbeddings[region.name];
      const jitteredVector = baseVector.map(v => v + (Math.random() - 0.5) * 0.01);
      const vectorString = `[${jitteredVector.join(',')}]`;

      const idx = j * 7;
      params.push(id, name, content, type, color, vectorString, wkt);
      values.push(`($${idx + 1}::uuid, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}::vector, ST_GeomFromText($${idx + 7}, 4326))`);
    }

    await client.query(`INSERT INTO "Area" (id, name, content, type, color, embedding, geom) VALUES ${values.join(',')}`, params);
    if ((i + BATCH_SIZE) % 5000 === 0) console.log(`Inserted ${i + BATCH_SIZE} / ${TOTAL_ROWS}`);
  }

  await client.end();
  console.log('Seeding finished.');
}

seed().catch(console.error);
