import { syncInsights } from './sync';
import { sendPendingConversions } from './conversions';
import { listPages, pageReport } from './pages';
import { connection } from './settings';

const SYNC_EVERY_MS = 60 * 60 * 1000;
const SEND_EVERY_MS = 10 * 60 * 1000;
// Meta keeps adjusting the last week as late conversions are counted.
const RECENT_DAYS = 7;
// About 13 months, so the Ads page can compare with the same month last year.
export const BACKFILL_DAYS = 400;

let sending = false;

// Syncs run one after another, so a backfill for a newly added account waits
// for the hourly sync instead of being skipped.
let queue: Promise<unknown> = Promise.resolve();
export function runSync(days = RECENT_DAYS, only?: string[]) {
  const run = queue.then(() => syncInsights(days, only));
  queue = run.catch(() => undefined);
  return run;
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

// Keep this month's page numbers loaded (the range the Pages page opens on),
// so nobody waits on Meta when they open it.
const WARM_EVERY_MS = 9 * 60 * 1000;
async function warm() {
  try {
    const conn = await connection();
    if (!conn?.row.ad_account_id) return;
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date());
    const from = `${today.slice(0, 7)}-01`;
    const page = (await listPages().catch(() => [])).find((p) => p.access);
    if (page) await pageReport(page.id, from, today).catch(() => undefined);
  } catch {}
}

export function startMetaAdsScheduler() {
  setTimeout(warm, 20_000);
  setInterval(warm, WARM_EVERY_MS);
  const sync = () => runSync().catch((e) => console.error('[meta-ads] sync failed:', e.message));
  setTimeout(sync, 30_000);
  setInterval(sync, SYNC_EVERY_MS);
  setTimeout(runSend, 45_000);
  setInterval(runSend, SEND_EVERY_MS);
}
