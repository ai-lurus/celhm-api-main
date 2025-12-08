// Script para probar la conexión a la base de datos
const { PrismaClient } = require('@prisma/client');
// Load .env manually
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, 'utf8');
  envFile.split('\n').forEach(line => {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) {
      process.env[match[1].trim()] = match[2].trim();
    }
  });
}

async function testConnection() {
  console.log('🔍 Probando conexión a la base de datos...\n');
  
  // Mostrar configuración (sin password completo)
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    try {
      const url = new URL(dbUrl);
      console.log('📋 Configuración:');
      console.log('   Host:', url.hostname);
      console.log('   Port:', url.port || '5432');
      console.log('   User:', url.username);
      console.log('   Database:', url.pathname.slice(1));
      console.log('   SSL:', url.searchParams.get('sslmode') || 'not set');
      console.log('');
    } catch (e) {
      console.log('❌ Error parseando URL:', e.message);
      return;
    }
  } else {
    console.log('❌ DATABASE_URL no está configurada');
    return;
  }
  
  const prisma = new PrismaClient({
    log: ['query', 'error', 'warn'],
  });
  
  try {
    console.log('🔄 Intentando conectar...');
    await prisma.$connect();
    console.log('✅ Conexión exitosa!\n');
    
    console.log('🔄 Probando query simple...');
    const result = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Query exitosa:', result);
    
    console.log('🔄 Probando contar usuarios...');
    const userCount = await prisma.user.count();
    console.log(`✅ Hay ${userCount} usuarios en la base de datos\n`);
    
    console.log('✅ Todas las pruebas pasaron!');
  } catch (error) {
    console.log('❌ Error de conexión:');
    console.log('   Tipo:', error.constructor.name);
    console.log('   Mensaje:', error.message);
    if (error.code) {
      console.log('   Código:', error.code);
    }
    if (error.meta) {
      console.log('   Meta:', JSON.stringify(error.meta, null, 2));
    }
    console.log('\n💡 Posibles soluciones:');
    console.log('   1. Verifica que la URL en .env sea correcta');
    console.log('   2. Verifica las credenciales en Supabase Dashboard');
    console.log('   3. Verifica que uses "Direct connection" en Supabase');
    console.log('   4. Verifica restricciones de IP en Supabase');
  } finally {
    await prisma.$disconnect();
  }
}

testConnection();

