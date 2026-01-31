import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { name: 'Xrule' },
    update: {},
    create: {
      name: 'Xrule',
      status: 'ACTIVE',
    },
  });

  const passwordHash = await bcrypt.hash('initpass', 10);

  await prisma.user.upsert({
    where: { email: 'wolvesgale0512@gmail.com' },
    update: {
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      mustChangePassword: false,
      tenantId: null,
    },
    create: {
      email: 'wolvesgale0512@gmail.com',
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      mustChangePassword: false,
      tenantId: null,
    },
  });

  console.info('Seeded tenant:', tenant.name);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
