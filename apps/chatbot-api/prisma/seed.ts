import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:mysecretpassword@localhost:5433/postgres?schema=public';
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const TOTAL_MINES = 500000;
  const AVG_CLUSTERS_PER_MINE = 50;
  const BATCH_SIZE = 100; // Mines per batch

  const stoneTypes = ['Neodymium', 'Dysprosium', 'Europium', 'Lanthanum', 'Cerium', 'Praseodymium', 'Terbium', 'Yttrium'];

  console.log(`Starting massive seed: ${TOTAL_MINES} mines, ~${TOTAL_MINES * AVG_CLUSTERS_PER_MINE} clusters...`);

  try {
    console.log('Cleaning up database...');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "SavedQuery", "DrillMission", "Cluster", "Mine", "Drill" RESTART IDENTITY CASCADE');

    console.log('Inserting Drills...');
    await prisma.drill.createMany({
      data: [
        { name: 'WorldDriller-8000', supportedStoneTypes: stoneTypes.slice(0, 4) },
        { name: 'DeepMiner-X', supportedStoneTypes: stoneTypes.slice(4) },
        { name: 'FranceCore-Pro', supportedStoneTypes: stoneTypes },
        { name: 'AlpineDrill-V2', supportedStoneTypes: ['Neodymium', 'Dysprosium'] },
        { name: 'Titan-Drill-Max', supportedStoneTypes: ['Terbium', 'Yttrium'] }
      ]
    });

    const drillEntities = await prisma.drill.findMany();

    for (let i = 0; i < TOTAL_MINES; i += BATCH_SIZE) {
      const currentBatchSize = Math.min(BATCH_SIZE, TOTAL_MINES - i);
      
      const mineValues: string[] = [];
      const clusterValues: string[] = [];
      const missionValues: string[] = [];
      
      for (let j = 0; j < currentBatchSize; j++) {
        const mineId = crypto.randomUUID();
        const mineName = `French-Mine-${i + j}`;
        
        // France Mainland Bounding Box
        const lon = -4.5 + Math.random() * 12.5; 
        const lat = 42.0 + Math.random() * 9.0;  
        
        const mineSize = 0.002; 
        const poly = `POLYGON((${lon - mineSize/2} ${lat - mineSize/2}, ${lon + mineSize/2} ${lat - mineSize/2}, ${lon + mineSize/2} ${lat + mineSize/2}, ${lon - mineSize/2} ${lat + mineSize/2}, ${lon - mineSize/2} ${lat - mineSize/2}))`;
        mineValues.push(`('${mineId}', '${mineName}', ST_GeomFromText('${poly}', 4326), NOW())`);

        // Clusters...
        const clusterCount = Math.floor(Math.random() * 20) + 40; 
        const clusterSpread = mineSize * 0.7;
        for (let k = 0; k < clusterCount; k++) {
          const clusterId = crypto.randomUUID();
          const stoneType = stoneTypes[Math.floor(Math.random() * stoneTypes.length)];
          const quantity = Math.floor(Math.random() * 450000) + 50000;
          const cLon = lon + (Math.random() * clusterSpread - clusterSpread/2);
          const cLat = lat + (Math.random() * clusterSpread - clusterSpread/2);
          clusterValues.push(`('${clusterId}', '${stoneType}', ${quantity}, ST_GeomFromText('POINT(${cLon} ${cLat})', 4326), '${mineId}', NOW())`);
        }

        // Drill Missions (Seed ~10,000 missions total across first batches)
        if (i < 50000 && Math.random() < 0.2) {
           const missionId = crypto.randomUUID();
           const drill = drillEntities[Math.floor(Math.random() * drillEntities.length)];
           const stoneType = stoneTypes[Math.floor(Math.random() * stoneTypes.length)];
           
           // Date between -5 and +5 years
           const now = new Date();
           const offsetMs = (Math.random() * 10 - 5) * 365 * 24 * 60 * 60 * 1000;
           const missionDate = new Date(now.getTime() + offsetMs);
           
           missionValues.push(`('${missionId}', '${stoneType}', '${missionDate.toISOString()}', '${drill.id}', '${mineId}', NOW())`);
        }
      }

      await prisma.$executeRawUnsafe(`INSERT INTO "Mine" (id, name, geom, created_at) VALUES ${mineValues.join(',')}`);
      
      const clusterSubBatchSize = 1000;
      for (let k = 0; k < clusterValues.length; k += clusterSubBatchSize) {
        const subBatch = clusterValues.slice(k, k + clusterSubBatchSize);
        await prisma.$executeRawUnsafe(`INSERT INTO "Cluster" (id, stone_type, quantity, geom, mine_id, created_at) VALUES ${subBatch.join(',')}`);
      }

      if (missionValues.length > 0) {
        await prisma.$executeRawUnsafe(`INSERT INTO "DrillMission" (id, stone_type, date, drill_id, mine_id, created_at) VALUES ${missionValues.join(',')}`);
      }

      if ((i + currentBatchSize) % 1000 === 0) {
        console.log(`Progress: ${i + currentBatchSize} mines inserted...`);
      }
    }

    console.log('Seed completed successfully.');
  } catch (error) {
    console.error('Seed failed:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
