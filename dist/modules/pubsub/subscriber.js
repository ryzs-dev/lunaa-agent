"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initParcelDailySubscribers = void 0;
const pubsub_1 = require("../pubsub");
const events_1 = require("./events");
const service_1 = __importDefault(require("../order_tracking/service"));
const database_1 = require("../orders/database");
const orderTrackingService = new service_1.default();
// Parcels created outside the CRM have an empty reference, and ones duplicated in
// Parcel Daily get a "-duplicated" suffix; neither can create a CRM tracking entry.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DELIVERED_STATUSES = database_1.ORDER_STATUS_GROUPS.delivered.map((s) => s.toLowerCase());
const FINAL_STATUSES = [
    ...DELIVERED_STATUSES,
    ...database_1.ORDER_STATUS_GROUPS.problem.map((s) => s.toLowerCase()),
];
let trackingUpdateQueue = Promise.resolve();
// Match by tracking number first: Parcel Daily's order reference is blank or
// stale for parcels booked or duplicated outside the CRM.
async function applyTrackingUpdate(payload) {
    var _a, _b;
    if (!payload.status)
        return;
    let entries = payload.tracking_number
        ? await orderTrackingService.getTrackingEntriesByTrackingNumber(payload.tracking_number)
        : [];
    if (!entries.length && UUID_PATTERN.test((_a = payload.crm_order_id) !== null && _a !== void 0 ? _a : '')) {
        entries = (await orderTrackingService.getTrackingEntriesByOrderId(payload.crm_order_id)).slice(0, 1);
    }
    if (!entries.length) {
        console.log(`⏭️ No CRM tracking entry for ${payload.tracking_number} (${JSON.stringify(payload.crm_order_id)})`);
        return;
    }
    const incoming = payload.status.toLowerCase();
    for (const entry of entries) {
        const current = String((_b = entry.status) !== null && _b !== void 0 ? _b : '').toLowerCase();
        if (current === incoming)
            continue;
        // A late or replayed event must not move a delivered parcel back to in transit.
        if (DELIVERED_STATUSES.includes(current) && !FINAL_STATUSES.includes(incoming)) {
            continue;
        }
        await orderTrackingService.updateTrackingEntry(entry.id, {
            status: payload.status,
        });
        console.log(`🔄 ${entry.tracking_number}: ${entry.status} → ${payload.status}`);
    }
}
const initParcelDailySubscribers = (io) => {
    const channels = [
        events_1.PubSubEvents.ORDER_CREATED,
        events_1.PubSubEvents.TRACKING_UPDATED,
        events_1.PubSubEvents.INCOMING_MESSAGE,
        events_1.PubSubEvents.OUTGOING_MESSAGE,
    ];
    // Subscribe individually
    for (const channel of channels) {
        pubsub_1.sub.subscribe(channel, (err, count) => {
            if (err)
                return console.error(`❌ Failed to subscribe to ${channel}:`, err);
            console.log(`📡 Subscribed to ${channel} (${count} channel(s))`);
        });
    }
    // Handle all messages
    pubsub_1.sub.on('message', async (channel, message) => {
        var _a;
        try {
            const payload = JSON.parse(message);
            if (payload.source !== 'status-sync') {
                console.log(`📨 Received ${channel}:`, payload);
            }
            if (channel === events_1.PubSubEvents.ORDER_CREATED &&
                !UUID_PATTERN.test((_a = payload.crm_order_id) !== null && _a !== void 0 ? _a : '')) {
                console.log(`⏭️ Skipping ${channel} for ${payload.tracking_number}: no CRM order (${JSON.stringify(payload.crm_order_id)})`);
                return;
            }
            switch (channel) {
                case events_1.PubSubEvents.INCOMING_MESSAGE:
                case events_1.PubSubEvents.OUTGOING_MESSAGE:
                    // Send only to relevant conversation room
                    if (payload.conversation_id) {
                        io.to(payload.conversation_id).emit('new_message', payload);
                        const socketsInRoom = await io
                            .in(payload.conversation_id)
                            .fetchSockets();
                        console.log(`Sockets in room ${payload.conversation_id}:`, socketsInRoom.length);
                    }
                    break;
                case events_1.PubSubEvents.ORDER_CREATED:
                    await orderTrackingService.addTrackingEntry({
                        status: payload.status,
                        courier: payload.courier,
                        tracking_number: payload.tracking_number,
                        message_status: 'pending',
                        last_message_sent_at: null,
                    }, payload.crm_order_id);
                    break;
                case events_1.PubSubEvents.TRACKING_UPDATED:
                    // Serialised so a burst of events (e.g. the status sync) cannot flood Supabase.
                    trackingUpdateQueue = trackingUpdateQueue
                        .then(() => applyTrackingUpdate(payload))
                        .catch((error) => console.error(`❌ Error applying tracking update for ${payload.tracking_number}:`, error));
                    break;
                default:
                    console.warn(`⚠️ Unknown channel: ${channel}`);
            }
        }
        catch (error) {
            console.error(`❌ Error processing message from ${channel}:`, error);
        }
    });
};
exports.initParcelDailySubscribers = initParcelDailySubscribers;
