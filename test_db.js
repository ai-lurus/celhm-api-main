const { Client } = require('pg');
const client = new Client({
  connectionString: "postgresql://postgres.sianvllhzskcobtvklif:.J5dBLLDh4*aKVK@aws-1-us-east-2.pooler.supabase.com:5432/postgres"
});
client.connect()
  .then(() => { console.log('Connected!'); return client.end(); })
  .catch(err => console.error('Error:', err));
