"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutopilotBusyError = void 0;
const database_1 = __importDefault(require("./database"));
const service_1 = require("../parcel-daily/service");
const shipment_from_order_1 = require("../orders/shipment-from-order");
const queue_1 = require("../queue/tracking_queue/queue");
const time_1 = require("./time");
const PARCEL_DAILY_API_URL = process.env.PARCEL_DAILY_API_URL || 'http://localhost:4002/api/parceldaily';
const one = (value) => { var _a; return Array.isArray(value) ? (_a = value[0]) !== null && _a !== void 0 ? _a : null : value !== null && value !== void 0 ? value : null; };
function summarise(items) {
    var _a;
    const summary = { total: items.length };
    for (const item of items)
        summary[item.state] = ((_a = summary[item.state]) !== null && _a !== void 0 ? _a : 0) + 1;
    return summary;
}
class AutopilotBusyError extends Error {
}
exports.AutopilotBusyError = AutopilotBusyError;
class AutopilotService {
    constructor() {
        this.db = new database_1.default();
        this.parcelDaily = new service_1.ParcelDailyService(PARCEL_DAILY_API_URL);
    }
    getSettings() {
        return this.db.getSettings();
    }
    updateSettings(input) {
        return this.db.updateSettings(input);
    }
    listRuns(limit = 30) {
        return this.db.listRuns(limit);
    }
    getRun(id) {
        return this.db.getRun(id);
    }
    setHold(orderId, hold) {
        return this.db.setHold(orderId, hold);
    }
    async shippingDefaults() {
        var _a, _b;
        try {
            const response = await this.parcelDaily.getSettings();
            return (_b = (_a = response === null || response === void 0 ? void 0 : response.data) === null || _a === void 0 ? void 0 : _a.defaults) !== null && _b !== void 0 ? _b : {};
        }
        catch (_c) {
            return {};
        }
    }
    // What a step would act on right now, without saving anything.
    async preview(step, settings) {
        const s = settings !== null && settings !== void 0 ? settings : (await this.db.getSettings());
        return step === 'ship' ? this.shipItems(s) : this.trackingItems(s);
    }
    capItems(items, max) {
        let ready = 0;
        return items.map((item) => {
            if (item.state !== 'ready')
                return item;
            ready += 1;
            return ready > max
                ? Object.assign(Object.assign({}, item), { state: 'over_limit', reason: `Over the limit of ${max} orders per run` }) : item;
        });
    }
    async shipItems(settings) {
        const [orders, defaults] = await Promise.all([
            this.db.shipCandidates(settings.lookback_days),
            this.shippingDefaults(),
        ]);
        const items = orders
            .filter((order) => settings.include_distributors || !order.is_distributor)
            .map((order) => {
            var _a, _b;
            const customer = one(order.customers);
            const base = {
                order_id: order.id,
                order_number: order.order_number,
                customer_name: (_a = customer === null || customer === void 0 ? void 0 : customer.name) !== null && _a !== void 0 ? _a : null,
                phone: (_b = customer === null || customer === void 0 ? void 0 : customer.phone_number) !== null && _b !== void 0 ? _b : null,
                amount: Number(order.total_amount) || 0,
            };
            if (order.autopilot_hold) {
                return Object.assign(Object.assign({}, base), { state: 'on_hold', reason: 'Held by staff' });
            }
            const built = (0, shipment_from_order_1.buildShipmentFromOrder)(Object.assign(Object.assign({}, order), { customers: customer, addresses: one(order.addresses) }), { serviceProvider: defaults.courier, isDropoff: defaults.isDropoff === true });
            return built.error
                ? Object.assign(Object.assign({}, base), { state: 'needs_attention', reason: built.error }) : Object.assign(Object.assign({}, base), { state: 'ready' });
        });
        return this.capItems(items, settings.max_orders_per_run);
    }
    async trackingItems(settings) {
        const rows = await this.db.trackingCandidates(settings.lookback_days);
        const items = rows
            .map((row) => {
            const order = one(row.orders);
            return { row, order };
        })
            .filter(({ order }) => order && !order.deleted_at)
            .filter(({ order }) => settings.include_distributors || !order.is_distributor)
            .map(({ row, order }) => {
            var _a, _b;
            const customer = one(order.customers);
            const base = {
                order_id: order.id,
                order_number: order.order_number,
                customer_name: (_a = customer === null || customer === void 0 ? void 0 : customer.name) !== null && _a !== void 0 ? _a : null,
                phone: (_b = customer === null || customer === void 0 ? void 0 : customer.phone_number) !== null && _b !== void 0 ? _b : null,
                order_tracking_id: row.id,
                tracking_number: row.tracking_number,
                courier: row.courier,
            };
            if (order.autopilot_hold) {
                return Object.assign(Object.assign({}, base), { state: 'on_hold', reason: 'Held by staff' });
            }
            if (!base.phone) {
                return Object.assign(Object.assign({}, base), { state: 'needs_attention', reason: 'Missing customer phone number' });
            }
            return Object.assign(Object.assign({}, base), { state: 'ready' });
        });
        return this.capItems(items, settings.max_orders_per_run);
    }
    // Builds a batch and saves it as a run. In review mode it waits for
    // approval; in automatic mode it executes straight away.
    async prepare(step, trigger) {
        // One batch per step at a time. A manual run returns the batch already
        // waiting; a scheduled run replaces a batch nobody approved.
        const active = await this.db.activeRuns(step);
        if (active.some((run) => run.status === 'running')) {
            throw new AutopilotBusyError(`A ${step === 'ship' ? 'shipping' : 'tracking'} run is in progress`);
        }
        const waiting = active.find((run) => run.status === 'awaiting_approval');
        if (waiting && trigger === 'manual')
            return waiting;
        for (const run of active) {
            await this.db.claimRun(run.id, 'awaiting_approval', {
                status: 'dismissed',
                error: 'Replaced by a newer batch',
                finished_at: new Date().toISOString(),
            });
        }
        const settings = await this.db.getSettings();
        const items = await this.preview(step, settings);
        const mode = step === 'ship' ? settings.ship_mode : settings.tracking_mode;
        const hasWork = items.some((item) => item.state === 'ready');
        const run = await this.db.createRun({
            step,
            trigger,
            // Nothing to do still leaves a record, so the log shows the step ran.
            status: !hasWork ? 'completed' : mode === 'auto' ? 'running' : 'awaiting_approval',
            run_date: (0, time_1.malaysiaNow)().date,
            items,
            summary: summarise(items),
        });
        if (!run)
            return null;
        if (!hasWork) {
            return this.db.updateRun(run.id, { finished_at: new Date().toISOString() });
        }
        if (mode === 'auto') {
            void this.execute(run).catch((error) => console.error(`[autopilot] ${step} run ${run.id} failed:`, error));
        }
        return run;
    }
    async approve(id, approvedBy) {
        const run = await this.db.claimRun(id, 'awaiting_approval', {
            status: 'running',
            approved_by: approvedBy !== null && approvedBy !== void 0 ? approvedBy : null,
            approved_at: new Date().toISOString(),
        });
        if (!run)
            return null;
        void this.execute(run).catch((error) => console.error(`[autopilot] ${run.step} run ${run.id} failed:`, error));
        return run;
    }
    dismiss(id) {
        return this.db.claimRun(id, 'awaiting_approval', {
            status: 'dismissed',
            finished_at: new Date().toISOString(),
        });
    }
    // Holding an order inside a waiting batch takes it out of that batch too.
    async holdInRun(runId, orderId, hold) {
        await this.db.setHold(orderId, hold);
        const run = await this.db.getRun(runId);
        if (!run || run.status !== 'awaiting_approval')
            return run;
        const items = run.items.map((item) => {
            if (item.order_id !== orderId)
                return item;
            if (hold && item.state === 'ready') {
                return Object.assign(Object.assign({}, item), { state: 'on_hold', reason: 'Held by staff' });
            }
            if (!hold && item.state === 'on_hold') {
                return Object.assign(Object.assign({}, item), { state: 'ready', reason: undefined });
            }
            return item;
        });
        return this.db.updateRun(runId, { items, summary: summarise(items) });
    }
    async execute(run) {
        try {
            const items = run.step === 'ship' ? await this.executeShip(run) : await this.executeTracking(run);
            await this.db.updateRun(run.id, {
                status: 'completed',
                items,
                summary: summarise(items),
                finished_at: new Date().toISOString(),
            });
        }
        catch (error) {
            await this.db.updateRun(run.id, {
                status: 'failed',
                error: error instanceof Error ? error.message : String(error),
                finished_at: new Date().toISOString(),
            });
        }
    }
    async executeShip(run) {
        var _a, _b;
        const settings = await this.db.getSettings();
        const account = await this.parcelDaily.getAccountInfo();
        const credit = Number((_a = account === null || account === void 0 ? void 0 : account.data) === null || _a === void 0 ? void 0 : _a.credit);
        if (!Number.isFinite(credit)) {
            throw new Error('Couldn’t read the Parcel Daily credit balance');
        }
        if (credit < settings.min_credit) {
            throw new Error(`Parcel Daily credit is RM ${credit.toFixed(2)}, below the RM ${settings.min_credit.toFixed(2)} minimum. Top up, then run again.`);
        }
        const defaults = await this.shippingDefaults();
        const items = [];
        for (const item of run.items) {
            if (item.state !== 'ready') {
                items.push(item);
                continue;
            }
            // Re-check: staff may have held, shipped or deleted it since the batch was made.
            const order = await this.db.getOrderForShipping(item.order_id);
            if (!order || order.deleted_at) {
                items.push(Object.assign(Object.assign({}, item), { state: 'skipped', reason: 'Order was deleted' }));
                continue;
            }
            if (order.autopilot_hold) {
                items.push(Object.assign(Object.assign({}, item), { state: 'skipped', reason: 'Held by staff' }));
                continue;
            }
            const built = (0, shipment_from_order_1.buildShipmentFromOrder)(Object.assign(Object.assign({}, order), { customers: one(order.customers), addresses: one(order.addresses) }), { serviceProvider: defaults.courier, isDropoff: defaults.isDropoff === true });
            if (built.error || !built.shipment) {
                items.push(Object.assign(Object.assign({}, item), { state: 'skipped', reason: (_b = built.error) !== null && _b !== void 0 ? _b : 'Could not build the shipment' }));
                continue;
            }
            const result = await this.parcelDaily.createShipment(built.shipment, order.id);
            if ((result === null || result === void 0 ? void 0 : result.success) === false) {
                items.push(Object.assign(Object.assign({}, item), { state: 'failed', reason: typeof result.message === 'string' ? result.message : 'Parcel Daily shipment failed' }));
                continue;
            }
            items.push(Object.assign(Object.assign({}, item), { state: 'shipped', reason: undefined }));
        }
        return items;
    }
    async executeTracking(run) {
        const items = [];
        const toSend = [];
        for (const item of run.items) {
            if (item.state !== 'ready' || !item.order_tracking_id) {
                items.push(item);
                continue;
            }
            const row = await this.db.getTrackingForSending(item.order_tracking_id);
            const order = one(row === null || row === void 0 ? void 0 : row.orders);
            if (!row || (order === null || order === void 0 ? void 0 : order.deleted_at)) {
                items.push(Object.assign(Object.assign({}, item), { state: 'skipped', reason: 'Order was deleted' }));
            }
            else if (row.last_message_sent_at || row.message_status === 'sent') {
                items.push(Object.assign(Object.assign({}, item), { state: 'skipped', reason: 'Already sent' }));
            }
            else if (order === null || order === void 0 ? void 0 : order.autopilot_hold) {
                items.push(Object.assign(Object.assign({}, item), { state: 'skipped', reason: 'Held by staff' }));
            }
            else {
                toSend.push(item);
            }
        }
        if (toSend.length) {
            await this.db.markTrackingQueued(toSend.map((item) => item.order_tracking_id));
            await (0, queue_1.enqueueTrackingFromAdmin)(toSend.map((item) => {
                var _a, _b;
                return ({
                    orderTrackingId: item.order_tracking_id,
                    name: (_a = item.customer_name) !== null && _a !== void 0 ? _a : undefined,
                    phone: item.phone,
                    tracking: item.tracking_number,
                    courier: (_b = item.courier) !== null && _b !== void 0 ? _b : undefined,
                });
            }));
            items.push(...toSend.map((item) => (Object.assign(Object.assign({}, item), { state: 'queued' }))));
        }
        return items;
    }
}
exports.default = AutopilotService;
