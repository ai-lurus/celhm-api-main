# Solución de Problemas de Conexión a Base de Datos

## Error: Can't reach database server

Si ves este error:
```
Can't reach database server at `aws-1-us-east-2.pooler.supabase.com:5432`
```

### Posibles Causas y Soluciones

#### 1. Variable de Entorno DATABASE_URL no configurada

**Solución:**
```bash
# Verificar que existe el archivo .env
ls -la .env

# Si no existe, crear uno basado en el ejemplo
cp .env.example .env

# Editar .env y agregar tu DATABASE_URL
nano .env
```

#### 2. Formato incorrecto de DATABASE_URL

**Formato correcto para Supabase:**
```env
# Para conexión directa (no recomendado en producción)
DATABASE_URL="postgresql://user:password@aws-1-us-east-2.pooler.supabase.com:5432/dbname?schema=public"

# Para conexión con pooler (recomendado)
DATABASE_URL="postgresql://user:password@aws-1-us-east-2.pooler.supabase.com:6543/dbname?pgbouncer=true&schema=public"
```

**Nota:** El puerto del pooler de Supabase es **6543**, no 5432.

#### 3. Problemas de Red/Firewall

**Verificar conectividad:**
```bash
# Probar conexión al servidor
telnet aws-1-us-east-2.pooler.supabase.com 5432
# o
nc -zv aws-1-us-east-2.pooler.supabase.com 5432
```

**Si no conecta:**
- Verificar que no haya firewall bloqueando el puerto
- Verificar que tu IP esté permitida en Supabase (Settings > Database > Connection Pooling)

#### 4. Credenciales Incorrectas

**Verificar:**
1. Ir a Supabase Dashboard
2. Settings > Database
3. Verificar las credenciales en "Connection string"
4. Asegurarse de usar el password correcto (no el password del proyecto)

#### 5. Usar Connection Pooler de Supabase

Supabase recomienda usar el **pooler** en lugar de la conexión directa:

```env
# ❌ No usar (conexión directa)
DATABASE_URL="postgresql://user:password@aws-1-us-east-2.pooler.supabase.com:5432/dbname"

# ✅ Usar (connection pooler)
DATABASE_URL="postgresql://user:password@aws-1-us-east-2.pooler.supabase.com:6543/dbname?pgbouncer=true"
```

**Diferencias:**
- Puerto 5432: Conexión directa (limitada a 1 conexión)
- Puerto 6543: Connection pooler (permite múltiples conexiones)

#### 6. Verificar Configuración en Supabase

1. Ir a Supabase Dashboard
2. Settings > Database
3. Verificar "Connection Pooling" está habilitado
4. Copiar la "Connection string" desde "Connection Pooling" (no desde "Connection string" directo)

### Comandos de Diagnóstico

```bash
# 1. Verificar que DATABASE_URL está configurada
echo $DATABASE_URL

# 2. Probar conexión con psql (si está instalado)
psql $DATABASE_URL -c "SELECT 1;"

# 3. Verificar con Prisma
cd /Users/laucho/Documents/Projects/ai-lurus/celhm-api-main
pnpm db:studio
```

### Solución Rápida

1. **Obtener la URL correcta de Supabase:**
   - Ve a Supabase Dashboard
   - Settings > Database
   - Connection Pooling > Connection string
   - Copia la URL completa

2. **Actualizar .env:**
   ```env
   DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@aws-1-us-east-2.pooler.supabase.com:6543/postgres?pgbouncer=true"
   ```

3. **Reiniciar el servidor:**
   ```bash
   pnpm dev
   ```

### Notas Importantes

- **Nunca commitees el archivo .env** con credenciales reales
- Usa el **pooler (puerto 6543)** en producción para mejor rendimiento
- El pooler requiere el parámetro `?pgbouncer=true` en la URL
- Verifica que tu IP esté permitida en Supabase si usas IP restrictions

