const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const userId = '00000000-0000-0000-0000-000000000000';
  
  // 1. Create a Tag
  const hrTag = await prisma.tag.upsert({
    where: { name: 'HR' },
    update: {},
    create: { name: 'HR' },
  });

  // 2. Create a User with the HR Tag
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      email: 'test@example.com',
      tags: {
        create: {
          tagId: hrTag.id
        }
      }
    },
  });

  // 3. Create a Public Entity (No Tags)
  await prisma.entity.create({
    data: {
      content: 'The company holiday policy is: 25 days per year.',
      type: 'document',
      // Note: In a real app, you'd generate this with an embedding model
      // For now, we leave it null or you'd need to provide a 1536-dim vector
    }
  });

  // 4. Create a Restricted Entity (HR Tag)
  await prisma.entity.create({
    data: {
      content: 'The CEO private salary is 1,000,000 USD.',
      type: 'confidential',
      tags: {
        create: {
          tagId: hrTag.id
        }
      }
    }
  });

  console.log('Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
