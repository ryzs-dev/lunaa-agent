"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initParcelDailySubscribers = void 0;
const pubsub_1 = require("../pubsub");
const events_1 = require("./events");
const service_1 = __importDefault(require("../order_tracking/service"));
const orderTrackingService = new service_1.default();
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
        try {
            const payload = JSON.parse(message);
            console.log(`📨 Received ${channel}:`, payload);
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
                    const result = await orderTrackingService.getTrackingEntriesByOrderId(payload.crm_order_id);
                    if (result.length) {
                        await orderTrackingService.updateTrackingEntry(result[0].id, {
                            status: payload.status,
                        });
                    }
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
