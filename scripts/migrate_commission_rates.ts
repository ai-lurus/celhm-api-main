import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const memberships = await prisma.orgMembership.findMany({
    where: { commissionRate: { not: null } },
  });

  console.log(`Found ${memberships.length} memberships with a legacy commissionRate.`);

  let created = 0;
  for (const membership of memberships) {
    const existing = await prisma.commissionRule.findFirst({
      where: { membershipId: membership.id, scopeType: 'GENERAL', basis: 'SALE_TOTAL' },
    });
    if (existing) {
      console.log(`Membership ${membership.id} already has a migrated rule, skipping.`);
      continue;
    }

    await prisma.commissionRule.create({
      data: {
        membershipId: membership.id,
        basis: 'SALE_TOTAL',
        scopeType: 'GENERAL',
        calcMethod: 'PERCENTAGE',
        value: membership.commissionRate as unknown as number,
        label: 'Migrado de commissionRate legacy',
      },
    });
    created += 1;
  }

  console.log(`Created ${created} commission rule(s).`);
}

main()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
