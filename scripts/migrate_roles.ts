import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("Adding new roles to enum...");
  const newRoles = ['TECNICO', 'VENDEDOR', 'ALMACENISTA', 'CAJERO'];
  for (const role of newRoles) {
    try {
      await prisma.$executeRawUnsafe(`ALTER TYPE "Role" ADD VALUE '${role}'`);
      console.log(`Added ${role}`);
    } catch (e: any) {
      console.log(`Value ${role} might already exist:`, e.message);
    }
  }

  console.log("Updating existing users...");
  await prisma.$executeRawUnsafe(`UPDATE org_memberships SET role = 'ADMINISTRADOR' WHERE role::text = 'ADMON'`);
  await prisma.$executeRawUnsafe(`UPDATE org_memberships SET role = 'TECNICO' WHERE role::text = 'LABORATORIO'`);
  await prisma.$executeRawUnsafe(`UPDATE org_memberships SET role = 'VENDEDOR' WHERE role::text = 'VENTAS'`);
  
  console.log("Migration complete.");
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
