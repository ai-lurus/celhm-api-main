import { PrismaClient, Role, TicketState, MovementType, TicketPartState, NotificationChannel } from '@prisma/client';
import { hash } from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create demo organization
  const organization = await prisma.organization.upsert({
    where: { slug: 'acme-repair' },
    update: {},
    create: {
      name: 'Acme Repair',
      slug: 'acme-repair',
    },
  });

  console.log('✅ Created organization:', organization.name);

  // Create demo branch
  const branch = await prisma.branch.upsert({
    where: { 
      organizationId_code: {
        organizationId: organization.id,
        code: 'SUC01'
      }
    },
    update: {},
    create: {
      organizationId: organization.id,
      code: 'SUC01',
      name: 'Sucursal Centro',
      address: 'Av. Principal 123, Centro',
      phone: '+52 555 123 4567',
      email: 'centro@acme-repair.com',
    },
  });

  console.log('✅ Created branch:', branch.name);

  // Create second branch
  const branch2 = await prisma.branch.upsert({
    where: { 
      organizationId_code: {
        organizationId: organization.id,
        code: 'SUC02'
      }
    },
    update: {},
    create: {
      organizationId: organization.id,
      code: 'SUC02',
      name: 'Sucursal Norte',
      address: 'Av. Norte 456, Zona Norte',
      phone: '+52 555 765 4321',
      email: 'norte@acme-repair.com',
    },
  });

  console.log('✅ Created branch:', branch2.name);

  // Create demo users
  const hashedPassword = await hash('ChangeMe123!', 10);
  
  const users = [
    {
      email: 'direccion@acme-repair.com',
      name: 'Juan Pérez',
      role: Role.DIRECCION,
      authUserId: 'mock-auth-user-1',
    },
    {
      email: 'admon@acme-repair.com',
      name: 'María García',
      role: Role.ADMON,
      authUserId: 'mock-auth-user-2',
    },
    {
      email: 'laboratorio@acme-repair.com',
      name: 'Carlos López',
      role: Role.LABORATORIO,
      authUserId: 'mock-auth-user-3',
    },
  ];

  const createdUsers = [];
  for (const userData of users) {
    const user = await prisma.user.upsert({
      where: { email: userData.email },
      update: {
        password: hashedPassword, // Update password if user exists
      },
      create: {
        ...userData,
        password: hashedPassword, // Store hashed password
        defaultOrganizationId: organization.id,
        branchId: branch.id,
      },
    });

    // Create organization membership
    await prisma.orgMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: user.id,
        },
      },
      update: {},
      create: {
        organizationId: organization.id,
        userId: user.id,
        role: userData.role,
      },
    });

    createdUsers.push(user);
    console.log('✅ Created user:', user.name, `(${user.role})`);
  }

  // Create demo products and variants
  const products = [
    {
      name: 'Pantalla LCD iPhone',
      description: 'Pantalla LCD para iPhone 12/13',
      category: 'Pantallas',
      brand: 'Apple',
      model: 'iPhone 12/13',
      variants: [
        { sku: 'LCD-IP12-BLK', name: 'Pantalla LCD iPhone 12 Negro', color: 'Negro' },
        { sku: 'LCD-IP12-WHT', name: 'Pantalla LCD iPhone 12 Blanco', color: 'Blanco' },
        { sku: 'LCD-IP13-BLK', name: 'Pantalla LCD iPhone 13 Negro', color: 'Negro' },
      ],
    },
    {
      name: 'Batería Samsung Galaxy',
      description: 'Batería original Samsung Galaxy S21',
      category: 'Baterías',
      brand: 'Samsung',
      model: 'Galaxy S21',
      variants: [
        { sku: 'BAT-SGS21-4000', name: 'Batería Samsung Galaxy S21 4000mAh', color: 'Negro' },
      ],
    },
    {
      name: 'Cargador USB-C',
      description: 'Cargador rápido USB-C 20W',
      category: 'Accesorios',
      brand: 'Generic',
      model: 'USB-C 20W',
      variants: [
        { sku: 'CHG-USBC-20W-BLK', name: 'Cargador USB-C 20W Negro', color: 'Negro' },
        { sku: 'CHG-USBC-20W-WHT', name: 'Cargador USB-C 20W Blanco', color: 'Blanco' },
      ],
    },
    {
      name: 'Cable Lightning',
      description: 'Cable Lightning 1m',
      category: 'Cables',
      brand: 'Generic',
      model: 'Lightning 1m',
      variants: [
        { sku: 'CBL-LIGHT-1M-BLK', name: 'Cable Lightning 1m Negro', color: 'Negro' },
        { sku: 'CBL-LIGHT-1M-WHT', name: 'Cable Lightning 1m Blanco', color: 'Blanco' },
      ],
    },
    {
      name: 'Protector de Pantalla',
      description: 'Protector de pantalla templado',
      category: 'Accesorios',
      brand: 'Generic',
      model: 'Templado',
      variants: [
        { sku: 'PROT-TEMP-IP12', name: 'Protector iPhone 12', color: 'Transparente' },
        { sku: 'PROT-TEMP-IP13', name: 'Protector iPhone 13', color: 'Transparente' },
        { sku: 'PROT-TEMP-SGS21', name: 'Protector Samsung Galaxy S21', color: 'Transparente' },
      ],
    },
    {
      name: 'Mica Hydrogel iPhone',
      description: 'Mica protectora hydrogel para iPhone',
      category: 'Accesorios',
      brand: 'Generic',
      model: 'Hydrogel',
      variants: [
        { sku: 'MIC-HYD-IP12', name: 'Mica Hydrogel iPhone 12', color: 'Transparente' },
        { sku: 'MIC-HYD-IP13', name: 'Mica Hydrogel iPhone 13', color: 'Transparente' },
      ],
    },
    {
      name: 'Batería iPhone',
      description: 'Batería de reemplazo para iPhone',
      category: 'Baterías',
      brand: 'Apple',
      model: 'iPhone 12/13',
      variants: [
        { sku: 'BAT-IP12-2815', name: 'Batería iPhone 12 2815mAh', color: 'Negro' },
        { sku: 'BAT-IP13-3240', name: 'Batería iPhone 13 3240mAh', color: 'Negro' },
      ],
    },
    {
      name: 'Cámara Trasera iPhone',
      description: 'Módulo de cámara trasera para iPhone',
      category: 'Cámaras',
      brand: 'Apple',
      model: 'iPhone 12/13',
      variants: [
        { sku: 'CAM-IP12-DUAL', name: 'Cámara Dual iPhone 12', color: 'Negro' },
        { sku: 'CAM-IP13-DUAL', name: 'Cámara Dual iPhone 13', color: 'Negro' },
      ],
    },
    {
      name: 'Puerto de Carga iPhone',
      description: 'Conector de carga Lightning',
      category: 'Componentes',
      brand: 'Apple',
      model: 'iPhone 12/13',
      variants: [
        { sku: 'CON-LIGHT-IP12', name: 'Conector Lightning iPhone 12', color: 'Negro' },
        { sku: 'CON-LIGHT-IP13', name: 'Conector Lightning iPhone 13', color: 'Negro' },
      ],
    },
  ];

  const createdVariants = [];
  for (const productData of products) {
    // Find existing product or create new one
    let product = await prisma.product.findFirst({
      where: { name: productData.name },
    });

    if (!product) {
      product = await prisma.product.create({
        data: {
          name: productData.name,
          description: productData.description,
          category: productData.category,
          brand: productData.brand,
          model: productData.model,
        },
      });
    }

    for (const variantData of productData.variants) {
      const variant = await prisma.variant.upsert({
        where: { sku: variantData.sku },
        update: {},
        create: {
          productId: product.id,
          sku: variantData.sku,
          name: variantData.name,
          description: `${productData.description} - ${variantData.color}`,
          brand: productData.brand,
          model: productData.model,
          color: variantData.color,
          price: Math.floor(Math.random() * 2000) + 100, // Random price between 100-2100
        },
      });
      createdVariants.push(variant);
    }
  }

  console.log('✅ Created products and variants:', createdVariants.length);

  // Create demo stocks with varied quantities
  const stockConfigs = [
    { min: 5, max: 100, qtyRange: [5, 55] }, // Normal stock
    { min: 3, max: 50, qtyRange: [1, 4] },  // Low stock
    { min: 10, max: 200, qtyRange: [50, 100] }, // High stock
  ];

  for (let i = 0; i < createdVariants.length; i++) {
    const variant = createdVariants[i];
    const config = stockConfigs[i % stockConfigs.length];
    const qty = Math.floor(Math.random() * (config.qtyRange[1] - config.qtyRange[0] + 1)) + config.qtyRange[0];
    
    // Stock for branch 1
    await prisma.stock.upsert({
      where: {
        branchId_variantId: {
          branchId: branch.id,
          variantId: variant.id,
        },
      },
      update: {},
      create: {
        branchId: branch.id,
        variantId: variant.id,
        qty,
        min: config.min,
        max: config.max,
        reserved: Math.floor(Math.random() * 3), // Some reserved items
      },
    });

    // Stock for branch 2 (different quantities)
    const qty2 = Math.floor(Math.random() * (config.qtyRange[1] - config.qtyRange[0] + 1)) + config.qtyRange[0];
    await prisma.stock.upsert({
      where: {
        branchId_variantId: {
          branchId: branch2.id,
          variantId: variant.id,
        },
      },
      update: {},
      create: {
        branchId: branch2.id,
        variantId: variant.id,
        qty: qty2,
        min: config.min,
        max: config.max,
        reserved: 0,
      },
    });
  }

  console.log('✅ Created stocks for all variants in both branches');

  // Create demo tickets
  const tickets = [
    {
      folio: 'LAB-SUC01-202412-0001',
      customerName: 'Ana Rodríguez',
      customerPhone: '+52 555 987 6543',
      customerEmail: 'ana.rodriguez@email.com',
      device: 'iPhone 12',
      brand: 'Apple',
      model: 'iPhone 12',
      serialNumber: 'ABC123456789',
      problem: 'Pantalla rota, no enciende',
      state: TicketState.RECIBIDO,
      estimatedCost: 2500,
      estimatedTime: 2,
    },
    {
      folio: 'LAB-SUC01-202412-0002',
      customerName: 'Roberto Silva',
      customerPhone: '+52 555 111 2222',
      device: 'Samsung Galaxy S21',
      brand: 'Samsung',
      model: 'Galaxy S21',
      problem: 'Batería no carga, se descarga rápido',
      state: TicketState.DIAGNOSTICO,
      estimatedCost: 800,
      estimatedTime: 1,
    },
    {
      folio: 'LAB-SUC01-202412-0003',
      customerName: 'Laura Martínez',
      customerPhone: '+52 555 333 4444',
      device: 'iPhone 13',
      brand: 'Apple',
      model: 'iPhone 13',
      problem: 'Cargador no funciona',
      state: TicketState.ESPERANDO_PIEZA,
      estimatedCost: 300,
      estimatedTime: 1,
    },
    {
      folio: 'LAB-SUC01-202412-0004',
      customerName: 'Miguel Torres',
      customerPhone: '+52 555 555 6666',
      device: 'iPhone 12',
      brand: 'Apple',
      model: 'iPhone 12',
      problem: 'Cambio de pantalla',
      state: TicketState.EN_REPARACION,
      estimatedCost: 2500,
      estimatedTime: 2,
    },
    {
      folio: 'LAB-SUC01-202412-0005',
      customerName: 'Patricia Hernández',
      customerPhone: '+52 555 777 8888',
      device: 'iPhone 13',
      brand: 'Apple',
      model: 'iPhone 13 Pro',
      serialNumber: 'XYZ987654321',
      problem: 'Batería inflada, requiere reemplazo urgente',
      diagnosis: 'Batería con falla de fabricación, requiere reemplazo',
      state: TicketState.REPARADO,
      estimatedCost: 1200,
      finalCost: 1200,
      estimatedTime: 1,
      warrantyDays: 90,
    },
    {
      folio: 'LAB-SUC01-202412-0006',
      customerName: 'Fernando Gómez',
      customerPhone: '+52 555 999 0000',
      device: 'Samsung Galaxy S21',
      brand: 'Samsung',
      model: 'Galaxy S21 Ultra',
      problem: 'Cámara trasera no enfoca',
      state: TicketState.DIAGNOSTICO,
      estimatedCost: 1800,
      estimatedTime: 2,
    },
    {
      folio: 'LAB-SUC01-202412-0007',
      customerName: 'Sofía Ramírez',
      customerPhone: '+52 555 111 3333',
      device: 'iPhone 12',
      brand: 'Apple',
      model: 'iPhone 12 Pro Max',
      problem: 'Puerto de carga dañado',
      diagnosis: 'Conector Lightning oxidado, requiere limpieza y posible reemplazo',
      solution: 'Limpieza profunda y reemplazo de conector',
      state: TicketState.ENTREGADO,
      estimatedCost: 600,
      finalCost: 550,
      estimatedTime: 1,
      warrantyDays: 30,
    },
  ];

  const createdTickets = [];
  for (let i = 0; i < tickets.length; i++) {
    const ticketData = tickets[i];
    const ticket = await prisma.ticket.upsert({
      where: { folio: ticketData.folio },
      update: {},
      create: {
        ...ticketData,
        branchId: branch.id,
        userId: createdUsers[2].id, // Laboratorio user
      },
    });

    // Create ticket history with progression
    const historyStates: TicketState[] = [TicketState.RECIBIDO];
    if (ticketData.state !== TicketState.RECIBIDO) {
      historyStates.push(TicketState.DIAGNOSTICO);
    }
    const advancedStates: TicketState[] = [TicketState.ESPERANDO_PIEZA, TicketState.EN_REPARACION, TicketState.REPARADO, TicketState.ENTREGADO];
    if (advancedStates.includes(ticketData.state)) {
      historyStates.push(TicketState.ESPERANDO_PIEZA, TicketState.EN_REPARACION);
    }
    const finalStates: TicketState[] = [TicketState.REPARADO, TicketState.ENTREGADO];
    if (finalStates.includes(ticketData.state)) {
      historyStates.push(TicketState.REPARADO);
    }
    if (ticketData.state === TicketState.ENTREGADO) {
      historyStates.push(TicketState.ENTREGADO);
    }

    for (let j = 0; j < historyStates.length; j++) {
      const state = historyStates[j];
      const notes = j === 0 ? 'Ticket creado' : 
                    state === TicketState.DIAGNOSTICO ? 'Diagnóstico realizado' :
                    state === TicketState.ESPERANDO_PIEZA ? 'Esperando pieza en stock' :
                    state === TicketState.EN_REPARACION ? 'En proceso de reparación' :
                    state === TicketState.REPARADO ? 'Reparación completada' :
                    state === TicketState.ENTREGADO ? 'Ticket entregado al cliente' : '';
      
      await prisma.ticketHistory.create({
        data: {
          ticketId: ticket.id,
          toState: state,
          notes,
          userId: createdUsers[2].id,
        },
      });
    }

    // Add parts to some tickets
    if (i === 3 && createdVariants.length > 0) {
      // Add LCD screen to ticket 4 (EN_REPARACION)
      await prisma.ticketPart.create({
        data: {
          ticketId: ticket.id,
          variantId: createdVariants[0].id, // First LCD variant
          qty: 1,
          state: TicketPartState.RESERVADA,
        },
      });
    }
    if (i === 4 && createdVariants.length > 1) {
      // Add battery to ticket 5 (REPARADO)
      await prisma.ticketPart.create({
        data: {
          ticketId: ticket.id,
          variantId: createdVariants[1].id, // Battery variant
          qty: 1,
          state: TicketPartState.CONSUMIDA,
        },
      });
    }
    if (i === 6 && createdVariants.length > 2) {
      // Add connector to ticket 7 (ENTREGADO)
      await prisma.ticketPart.create({
        data: {
          ticketId: ticket.id,
          variantId: createdVariants[createdVariants.length - 1].id, // Last variant (connector)
          qty: 1,
          state: TicketPartState.CONSUMIDA,
        },
      });
    }

    createdTickets.push(ticket);
  }

  console.log('✅ Created tickets:', createdTickets.length, 'with history and parts');

  // Create demo movements with variety
  const movements = [
    {
      type: MovementType.ING,
      qty: 20,
      reason: 'Compra inicial de inventario',
      folio: 'ING-SUC01-202412-0001',
    },
    {
      type: MovementType.ING,
      qty: 15,
      reason: 'Reposición de stock',
      folio: 'ING-SUC01-202412-0002',
    },
    {
      type: MovementType.TRF_IN,
      qty: 10,
      reason: 'Transferencia desde otra sucursal',
      folio: 'TRF_IN-SUC01-202412-0001',
    },
    {
      type: MovementType.VTA,
      qty: 2,
      reason: 'Venta directa a cliente',
      folio: 'VTA-SUC01-202412-0001',
    },
    {
      type: MovementType.EGR,
      qty: 1,
      reason: 'Uso en reparación',
      folio: 'EGR-SUC01-202412-0001',
    },
    {
      type: MovementType.AJU,
      qty: -3,
      reason: 'Ajuste por inventario físico',
      folio: 'AJU-SUC01-202412-0001',
    },
  ];

  // Create movements for various variants
  for (let i = 0; i < movements.length; i++) {
    const movementData = movements[i];
    const variantIndex = i % Math.min(createdVariants.length, 5); // Cycle through first 5 variants
    
    await prisma.movement.create({
      data: {
        ...movementData,
        branchId: branch.id,
        variantId: createdVariants[variantIndex].id,
        userId: createdUsers[1].id, // Admon user
      },
    });
  }

  // Create movements for branch 2
  await prisma.movement.create({
    data: {
      type: MovementType.ING,
      qty: 25,
      reason: 'Stock inicial sucursal norte',
      folio: 'ING-SUC02-202412-0001',
      branchId: branch2.id,
      variantId: createdVariants[0].id,
      userId: createdUsers[1].id,
    },
  });

  console.log('✅ Created demo movements for both branches');

  // Create notification templates
  const templates = [
    {
      channel: NotificationChannel.EMAIL,
      code: 'ticket_state_changed',
      name: 'Cambio de Estado - Email',
      bodyMdx: `# Estado de Ticket Actualizado

Hola {{customerName}},

Tu ticket **{{folio}}** ha cambiado de estado a **{{state}}**.

**Sucursal:** {{branchName}}  
**Fecha:** {{updatedAt}}

{{#if notes}}
**Notas:** {{notes}}
{{/if}}

Gracias por confiar en nosotros.`,
    },
    {
      channel: NotificationChannel.WHATSAPP,
      code: 'ticket_state_changed',
      name: 'Cambio de Estado - WhatsApp',
      bodyMdx: `🔧 *Actualización de Ticket*

Hola {{customerName}},

Tu ticket *{{folio}}* ha cambiado a *{{state}}*.

📍 Sucursal: {{branchName}}  
📅 Fecha: {{updatedAt}}

{{#if notes}}
📝 Notas: {{notes}}
{{/if}}

¡Gracias por confiar en nosotros!`,
    },
    {
      channel: NotificationChannel.SMS,
      code: 'ticket_state_changed',
      name: 'Cambio de Estado - SMS',
      bodyMdx: `Ticket {{folio}} - Estado: {{state}}. Sucursal: {{branchName}}. Fecha: {{updatedAt}}. {{#if notes}}Notas: {{notes}}{{/if}}`,
    },
  ];

  for (const templateData of templates) {
    await prisma.notificationTemplate.upsert({
      where: {
        organizationId_channel_code: {
          organizationId: organization.id,
          channel: templateData.channel,
          code: templateData.code,
        },
      },
      update: {},
      create: {
        ...templateData,
        organizationId: organization.id,
      },
    });
  }

  console.log('✅ Created notification templates');

  // Create folio sequences for both branches
  const prefixes = ['LAB', 'VTA', 'ING', 'EGR', 'AJU', 'TRF_IN', 'TRF_OUT'];
  const currentPeriod = new Date().toISOString().slice(0, 7).replace('-', ''); // YYYYMM

  for (const branchData of [branch, branch2]) {
    for (const prefix of prefixes) {
      await prisma.folioSequence.upsert({
        where: {
          prefix_branchId_period: {
            prefix,
            branchId: branchData.id,
            period: currentPeriod,
          },
        },
        update: {},
        create: {
          branchId: branchData.id,
          prefix,
          period: currentPeriod,
          seq: 0,
        },
      });
    }
  }

  console.log('✅ Created folio sequences for both branches');

  console.log('🎉 Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

