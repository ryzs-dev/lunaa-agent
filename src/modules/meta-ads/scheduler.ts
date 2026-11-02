import { syncInsights } from './sync';
import { sendPendingConversions } from './conversions';

const SYNC_EVERY_MS = 60 * 60 * 1000;
const SEND_EVERY_MS = 10 * 60 * 1000;
// Meta keeps adjusting the last week as late conversions are counted.
const RECENT_DAYS = 7;
// About 13 months, so the Ads page can compare with the same month last year.
export const BACKFILL_DAYS = 400;

let syncing = false;
let sending = false;

export async function runSync(days = RECENT_DAYS) {
  if (syncing) return { busy: true };
  syncing = true;
  try {
    return await syncInsights(days);
  } finally {
    syncing = false;
  }
}

async function runSend() {
  if (sending) return;
  sending = true;
  try {
    const result = await sendPendingConversions();
    if (!('skipped' in result) && (result.sent || result.failed)) {
      console.log('[meta-ads] conversions', result);
    }
  } catch (error) {
    console.error('[meta-ads] sending conversions failed:', error);
  } finally {
    sending = false;
  }
}

export function startMetaAdsScheduler() {
  const sync = () => runSync().catch((e) => console.error('[meta-ads] sync failed:', e.message));
  setTimeout(sync, 30_000);
  setInterval(sync, SYNC_EVERY_MS);
  setTimeout(runSend, 45_000);
  setInterval(runSend, SEND_EVERY_MS);
}
