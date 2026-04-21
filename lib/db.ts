import { neon } from '@neondatabase/serverless';

const conn = process.env.DATABASE_URL ?? '';
export const sql = neon(conn);
