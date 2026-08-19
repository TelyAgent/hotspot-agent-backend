import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.ensureReady();
  await prisma.clearTopicCircleMockData();
  await prisma.$disconnect();
  console.log('Cleared mock topic circle data.');
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
