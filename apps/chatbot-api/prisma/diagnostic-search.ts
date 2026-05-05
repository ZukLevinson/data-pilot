import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';

async function main() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:mysecretpassword@localhost:5433/postgres?schema=public';
  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const stoneType = 'Neodymium';
    console.log(`Checking for mines containing ${stoneType}...`);
    
    const count = await prisma.mine.count({
      where: {
        clusters: {
          some: {
            stoneType: {
              contains: stoneType,
              mode: 'insensitive'
            }
          }
        }
      }
    });
    
    console.log(`Found ${count} mines with ${stoneType}.`);

    const mines = await prisma.mine.findMany({
      where: {
        clusters: {
          some: {
            stoneType: {
              contains: stoneType,
              mode: 'insensitive'
            }
          }
        }
      },
      take: 5
    });
    
    console.log('Sample mines:', JSON.stringify(mines, null, 2));

  } catch (error) {
    console.error('Diagnostic failed:', error);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch(console.error);
