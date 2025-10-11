"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initParcelDailySubscribers = void 0;
const service_1 = __importDefault(require("../order_tracking/service"));
const pubsub_1 = require("../pubsub");
const events_1 = require("./events");
const orderTrackingService = new service_1.default();
const initParcelDailySubscribers = () => {
    pubsub_1.sub.subscribe(events_1.PubSubEvents.ORDER_UPDATED, (err, count) => {
        if (err) {
            console.error('❌ Failed to subscribe to ORDER_UPDATED:', err);
            return;
        }
        console.log(`📡 Subscribed to ${count} channel(s): ORDER_UPDATED`);
    });
    pubsub_1.sub.subscribe(events_1.PubSubEvents.TRACKING_UPDATED, (err, count) => {
        if (err) {
            console.error('❌ Failed to subscribe to TRACKING_UPDATED:', err);
            return;
        }
        console.log(`📡 Subscribed to ${count} channel(s): TRACKING_UPDATED`);
    });
    pubsub_1.sub.on('message', async (channel, message) => {
        const payload = JSON.parse(message);
        if (channel === events_1.PubSubEvents.ORDER_UPDATED) {
            const entryData = {
                tracking_number: payload.tracking_number,
                courier: payload.courier,
                status: payload.status || 'pending',
            };
            // 🔄 Update CRM DB
            try {
                const result = await orderTrackingService.addTrackingEntry(entryData, payload.crm_order_id);
            }
            catch (error) {
                console.error('❌ Error updating CRM tracking entry:', error);
            }
        }
        if (channel === events_1.PubSubEvents.TRACKING_UPDATED) {
            try {
                const result = await orderTrackingService.getTrackingEntriesByOrderId(payload.crm_order_id);
                if (result.length === 0) {
                    console.warn('⚠️ No tracking entry found for order ID:', payload.crm_order_id);
                    return;
                }
                await orderTrackingService.updateTrackingEntry(result[0].id, {
                    status: payload.status,
                });
            }
            catch (error) {
                console.error('❌ Error updating CRM tracking entry (TRACKING_UPDATED):', error);
            }
        }
    });
};
exports.initParcelDailySubscribers = initParcelDailySubscribers;
