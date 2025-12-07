import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🔐 Updating user passwords...');

  const hashedPassword = await hash('ChangeMe123!', 10);

  const users = [
    'direccion@acme-repair.com',
    'admon@acme-repair.com',
    'laboratorio@acme-repair.com',
  ];

  for (const email of users) {
    const user = await prisma.user.update({
      where: { email },
      data: { password: hashedPassword },
    });
    console.log(`✅ Updated password for: ${email}`);
  }

  console.log('🎉 Password update completed!');
}

main()
  .catch((e) => {
    console.error('❌ Password update failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

