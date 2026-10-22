/**
 * Backfill / periodic full sync of Lunaa customers into Converra contacts.
 *
 *   node dist/scripts/sync-customers-to-converra.js --dry-run
 *   node dist/scripts/sync-customers-to-converra.js
 *
 * Requires CONVERRA_API_URL, CONVERRA_BUSINESS_ID, CONVERRA_BRIDGE_API_KEY (and Supabase env).
 * The same sync can be started from the dashboard: Integrations → Converra → Sync now.
 */
import { runFullCustomerSync } from '../modules/converra/converra-full-sync';

runFullCustomerSync({
  dryRun: process.argv.includes('--dry-run'),
  log: (message) => console.log(`[sync] ${message}`),
})
  .then((summary) => {
    console.log(JSON.stringify(summary));
    process.exit(0);
  })
  .catch((err) => {
    console.error('[sync] failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
