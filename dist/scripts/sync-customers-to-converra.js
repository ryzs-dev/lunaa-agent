"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Backfill / periodic full sync of Lunaa customers into Converra contacts.
 *
 *   node dist/scripts/sync-customers-to-converra.js --dry-run
 *   node dist/scripts/sync-customers-to-converra.js
 *
 * Uses the connection made in the dashboard (Integrations → Converra → Connect), or the legacy
 * CONVERRA_API_URL / CONVERRA_BUSINESS_ID / CONVERRA_BRIDGE_API_KEY env while none was made,
 * and honours the dashboard's sync settings (segments as tags, email, selected segments).
 * Runs from this script are not recorded in the dashboard's sync history.
 * The same sync can be started from the dashboard: Integrations → Converra → Sync now.
 */
const converra_full_sync_1 = require("../modules/converra/converra-full-sync");
(0, converra_full_sync_1.runFullCustomerSync)({
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
