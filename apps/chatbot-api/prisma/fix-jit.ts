import { Pool } from 'pg';

async function main() {
  const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:mysecretpassword@localhost:5433/postgres?schema=public';
  const pool = new Pool({ connectionString });

  try {
    console.log('Disabling JIT in Postgres...');
    await pool.query('ALTER SYSTEM SET jit = off');
    await pool.query('SELECT pg_reload_conf()');
    console.log('JIT disabled and configuration reloaded.');
    
    // Also verify
    const res = await pool.query('SHOW jit');
    console.log('Current JIT setting:', res.rows[0].jit);
  } catch (error) {
    console.error('Failed to disable JIT:', error);
    console.log('Trying to disable JIT for the session instead...');
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
