import crypto from 'crypto';
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

  const adminEmail = 'wolvesgale0512@gmail.com';
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existingAdmin) {
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: {
        passwordHash,
        role: UserRole.SUPER_ADMIN,
        isActive: true,
        mustChangePassword: false,
        tenantId: null,
        authUserId: existingAdmin.authUserId ?? existingAdmin.id,
      },
    });
  } else {
    const newUserId = crypto.randomUUID();
    await prisma.user.create({
      data: {
        id: newUserId,
        authUserId: newUserId,
        email: adminEmail,
        passwordHash,
        role: UserRole.SUPER_ADMIN,
        isActive: true,
        mustChangePassword: false,
        tenantId: null,
      },
    });
  }

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
