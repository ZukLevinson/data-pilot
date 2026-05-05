import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:mysecretpassword@localhost:5433/postgres?schema=public';
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const mineCount = await prisma.mine.count();
    console.log('Mine count:', mineCount);
    
    const mines = await prisma.mine.findMany({ take: 5 });
    console.log('Mines:', mines.map(m => m.name));
    
    const ids = mines.map(m => m.id);
    const wkts = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, ST_AsText(geom) as wkt FROM "Mine" WHERE id::text IN (${ids.map(id => `'${id}'`).join(',')})`
    );
    console.log('WKTs:', wkts);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
