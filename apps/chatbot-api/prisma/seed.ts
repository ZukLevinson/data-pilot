import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:mysecretpassword@localhost:5433/postgres?schema=public';
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    console.log('Cleaning up database...');
    await prisma.drillMission.deleteMany();
    await prisma.cluster.deleteMany();
    await prisma.drill.deleteMany();
    await prisma.mine.deleteMany();

    console.log('Seeding Mines...');
    const mine1Id = '417b3f9c-738b-4a53-8557-0b1a0391d1e4';
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Mine" (id, name, geom, created_at)
      VALUES ('${mine1Id}', 'Negev North Mine', 
              ST_GeomFromText('POLYGON((34.7 31.2, 34.9 31.2, 34.9 31.4, 34.7 31.4, 34.7 31.2))', 4326),
              NOW())
    `);

    const mine2Id = '5a8b3f9c-738b-4a53-8557-0b1a0391d1e5';
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Mine" (id, name, geom, created_at)
      VALUES ('${mine2Id}', 'Arava Southern Mine', 
              ST_GeomFromText('POLYGON((34.9 29.5, 35.1 29.5, 35.1 29.7, 34.9 29.7, 34.9 29.5))', 4326),
              NOW())
    `);

    console.log('Seeding Clusters...');
    const cluster1Id = '6b9c3f9c-738b-4a53-8557-0b1a0391d1e6';
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Cluster" (id, stone_type, quantity, geom, mine_id, created_at)
      VALUES ('${cluster1Id}', 'Neodymium', 1500.5, 
              ST_GeomFromText('POINT(34.8 31.3)', 4326),
              '${mine1Id}', NOW())
    `);

    const cluster2Id = '7c0d3f9c-738b-4a53-8557-0b1a0391d1e7';
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Cluster" (id, stone_type, quantity, geom, mine_id, created_at)
      VALUES ('${cluster2Id}', 'Dysprosium', 450.2, 
              ST_GeomFromText('POINT(34.85 31.35)', 4326),
              '${mine1Id}', NOW())
    `);

    const cluster3Id = '8d1e3f9c-738b-4a53-8557-0b1a0391d1e8';
    await prisma.$executeRawUnsafe(`
      INSERT INTO "Cluster" (id, stone_type, quantity, geom, mine_id, created_at)
      VALUES ('${cluster3Id}', 'Europium', 250.8, 
              ST_GeomFromText('POINT(35.0 29.6)', 4326),
              '${mine2Id}', NOW())
    `);

    console.log('Seeding Drills...');
    const drill1 = await prisma.drill.create({
      data: {
        name: 'Titan-X1',
        supportedStoneTypes: ['Neodymium', 'Dysprosium']
      }
    });

    const drill2 = await prisma.drill.create({
      data: {
        name: 'GeoExplorer-Pro',
        supportedStoneTypes: ['Europium', 'Lanthanum', 'Cerium']
      }
    });

    console.log('Seeding Drill Missions...');
    await prisma.drillMission.create({
      data: {
        mineId: mine1Id,
        drillId: drill1.id,
        stoneType: 'Neodymium',
        date: new Date('2026-06-01T08:00:00Z')
      }
    });

    await prisma.drillMission.create({
      data: {
        mineId: mine2Id,
        drillId: drill2.id,
        stoneType: 'Europium',
        date: new Date('2026-07-15T09:00:00Z')
      }
    });

    console.log('Seed completed successfully.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
