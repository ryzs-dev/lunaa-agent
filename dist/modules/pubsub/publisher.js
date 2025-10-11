"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishOrderCreated = void 0;
const index_1 = require("./index");
const events_1 = require("./events");
const publishOrderCreated = async (data) => {
    await index_1.pub.publish(events_1.PubSubEvents.ORDER_CREATED, JSON.stringify(data));
    console.log('📦 Published order.created event:', data);
};
exports.publishOrderCreated = publishOrderCreated;
