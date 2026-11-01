"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startAutopilotScheduler = startAutopilotScheduler;
const service_1 = __importDefault(require("./service"));
const database_1 = __importDefault(require("./database"));
const time_1 = require("./time");
// A step that was due while the server was down still runs if it comes back
// within this window; later than that it waits for tomorrow.
const CATCH_UP_MINUTES = 180;
const TICK_MS = 60 * 1000;
const service = new service_1.default();
const db = new database_1.default();
let ticking = false;
async function tick() {
    if (ticking)
        return;
    ticking = true;
    try {
        const settings = await db.getSettings();
        if (!settings.enabled)
            return;
        const now = (0, time_1.malaysiaNow)();
        const steps = [
            { step: 'ship', on: settings.ship_enabled, time: settings.ship_time },
            { step: 'tracking', on: settings.tracking_enabled, time: settings.tracking_time },
        ];
        for (const { step, on, time } of steps) {
            if (!on)
                continue;
            const late = now.minutes - (0, time_1.toMinutes)(time);
            if (late < 0 || late > CATCH_UP_MINUTES)
                continue;
            if (await db.hasScheduledRun(step, now.date))
                continue;
            const run = await service.prepare(step, 'schedule');
            if (run) {
                console.log(`[autopilot] ${step} run ${run.id} prepared (${run.status})`);
            }
        }
    }
    catch (error) {
        console.error('[autopilot] tick failed:', error);
    }
    finally {
        ticking = false;
    }
}
function startAutopilotScheduler() {
    console.log('[autopilot] scheduler started');
    void db
        .failInterruptedRuns()
        .catch((error) => console.error('[autopilot] could not close interrupted runs:', error))
        .then(() => {
        void tick();
        setInterval(() => void tick(), TICK_MS);
    });
}
