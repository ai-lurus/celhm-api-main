import * as dotenv from 'dotenv';
dotenv.config();
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'FOUND' : 'NOT FOUND');
console.log('DATABASE_URL length:', process.env.DATABASE_URL ? process.env.DATABASE_URL.length : 0);
