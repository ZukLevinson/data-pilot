import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:mysecretpassword@localhost:5433/postgres?schema=public';
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const TOTAL_MINES = 100;
  const CLUSTERS_PER_MINE = 100;
  const TOTAL_DRILLS = 100;
  const TOTAL_MISSIONS = 10000;

  const stoneTypes = [
    'Neodymium', 'Dysprosium', 'Europium', 'Lanthanum', 'Cerium', 
    'Praseodymium', 'Terbium', 'Yttrium', 'Scandium', 'Gadolinium',
    'Holmium', 'Erbium', 'Thulium', 'Ytterbium', 'Lutetium',
    'Samarium', 'Lithium', 'Cobalt', 'Nickel', 'Graphite'
  ];

  console.log(`Starting curated seed: ${TOTAL_MINES} mines, ${TOTAL_MINES * CLUSTERS_PER_MINE} clusters...`);

  try {
    console.log('Cleaning up database...');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "SavedQuery", "DrillMission", "Cluster", "Mine", "Drill" RESTART IDENTITY CASCADE');

    console.log(`Inserting ${TOTAL_DRILLS} Drills...`);
    const drillsData = [];
    for (let i = 0; i < TOTAL_DRILLS; i++) {
      drillsData.push({
        name: `Drill-Master-${i + 1}`,
        supportedStoneTypes: stoneTypes.sort(() => 0.5 - Math.random()).slice(0, 5)
      });
    }
    await prisma.drill.createMany({ data: drillsData });
    const drillEntities = await prisma.drill.findMany();

    console.log(`Inserting ${TOTAL_MINES} Mines and their Clusters...`);
    for (let i = 0; i < TOTAL_MINES; i++) {
      const mineId = crypto.randomUUID();
      const mineName = `Mine-Regional-${i + 1}`;
      
      // Random coordinates (spread across a regional area)
      const lon = 34.5 + Math.random() * 1.5;
      const lat = 29.5 + Math.random() * 3.5;
      
      const mineSize = 0.005;
      const poly = `POLYGON((${lon - mineSize} ${lat - mineSize}, ${lon + mineSize} ${lat - mineSize}, ${lon + mineSize} ${lat + mineSize}, ${lon - mineSize} ${lat + mineSize}, ${lon - mineSize} ${lat - mineSize}))`;
      
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Mine" (id, name, geom, created_at) VALUES ('${mineId}', '${mineName}', ST_GeomFromText('${poly}', 4326), NOW())`
      );

      // Dominant stone for this mine to satisfy "large quantity of a single stone compared to others"
      const dominantStone = stoneTypes[Math.floor(Math.random() * stoneTypes.length)];
      const clusterValues: string[] = [];

      for (let j = 0; j < CLUSTERS_PER_MINE; j++) {
        const clusterId = crypto.randomUUID();
        const isDominant = j === 0 || Math.random() < 0.2; // ~20% of clusters are the dominant type
        const stoneType = isDominant ? dominantStone : stoneTypes[Math.floor(Math.random() * stoneTypes.length)];
        
        // Dominant stone clusters have 10-20x the quantity of others
        const quantity = isDominant 
          ? Math.floor(Math.random() * 800000) + 400000  // 400k - 1.2M
          : Math.floor(Math.random() * 30000) + 5000;    // 5k - 35k
          
        const cLon = lon + (Math.random() * mineSize * 1.5 - (mineSize * 1.5)/2);
        const cLat = lat + (Math.random() * mineSize * 1.5 - (mineSize * 1.5)/2);
        
        clusterValues.push(`('${clusterId}', '${stoneType}', ${quantity}, ST_GeomFromText('POINT(${cLon} ${cLat})', 4326), '${mineId}', NOW())`);
      }
      
      await prisma.$executeRawUnsafe(
        `INSERT INTO "Cluster" (id, stone_type, quantity, geom, mine_id, created_at) VALUES ${clusterValues.join(',')}`
      );
      
      if ((i + 1) % 20 === 0) console.log(`Progress: ${i + 1} mines inserted...`);
    }

    console.log(`Inserting ${TOTAL_MISSIONS} Drill Missions...`);
    const mineEntities = await prisma.mine.findMany();
    const missionBatchSize = 1000;
    
    for (let i = 0; i < TOTAL_MISSIONS; i += missionBatchSize) {
      const missionValues: string[] = [];
      const currentBatch = Math.min(missionBatchSize, TOTAL_MISSIONS - i);
      
      for (let j = 0; j < currentBatch; j++) {
        const missionId = crypto.randomUUID();
        const mine = mineEntities[Math.floor(Math.random() * mineEntities.length)];
        const drill = drillEntities[Math.floor(Math.random() * drillEntities.length)];
        const stoneType = stoneTypes[Math.floor(Math.random() * stoneTypes.length)];
        
        // Date spread across the last 2 years and next 2 years
        const now = new Date();
        const twoYearsMs = 2 * 365 * 24 * 60 * 60 * 1000;
        const offsetMs = (Math.random() * 2 - 1) * twoYearsMs;
        const missionDate = new Date(now.getTime() + offsetMs);
        
        missionValues.push(`('${missionId}', '${stoneType}', '${missionDate.toISOString()}', '${drill.id}', '${mine.id}', NOW())`);
      }
      
      await prisma.$executeRawUnsafe(
        `INSERT INTO "DrillMission" (id, stone_type, date, drill_id, mine_id, created_at) VALUES ${missionValues.join(',')}`
      );
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
