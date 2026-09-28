import { runStoreContract } from '@walangstudio/badgetrip-testing';
import { Pool } from 'pg';
import { pgStores } from '../src/index.js';

// Demonstrates verifying a custom adapter with the shipped conformance kit.
// Runs only when BADGETRIP_PG_URL points at a throwaway Postgres database.
const URL = process.env.BADGETRIP_PG_URL;

if (URL) {
  const pool = new Pool({ connectionString: URL });
  runStoreContract(async () => {
    const stores = pgStores(pool);
    await stores.migrate();
    await pool.query('TRUNCATE events, score_deltas, score_totals, achievements, streaks');
    return stores;
  });
}
