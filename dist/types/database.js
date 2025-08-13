"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationStatus = exports.MessageStatus = exports.COLUMN_MAPPING = void 0;
// Define mapping between Google Sheets columns and database fields
exports.COLUMN_MAPPING = {
    no: "id",
    "order date": "order_date",
    fbname: "fb_name",
    name: "customer_name",
    "payment method": "payment_method",
    wash: "wash_qty",
    "femlift 30ml": "femlift_30ml_qty",
    "femlift 10ml": "femlift_10ml_qty",
    "wash 30ml": "wash_30ml_qty",
    spray: "spray_qty",
    remark: "remark",
    "package (rm)": "package_price",
    "postage (rm)": "postage",
    "total paid (rm)": "total_paid",
    "shipment description": "shipment_description",
    "phone number": "phone_number",
    "tracking number": "tracking_number",
    "courires company": "courier_company", // typo preserved from original
    "courier company": "courier_company", // correct spelling
    status: "status",
    "new/repeat": "new_or_repeat",
    "cash sale receipt": "cash_sale_receipt",
    "agent by / under": "agent_name",
    currency: "currency",
};
// Twilio message statuses
var MessageStatus;
(function (MessageStatus) {
    MessageStatus["QUEUED"] = "queued";
    MessageStatus["SENDING"] = "sending";
    MessageStatus["SENT"] = "sent";
    MessageStatus["DELIVERED"] = "delivered";
    MessageStatus["READ"] = "read";
    MessageStatus["FAILED"] = "failed";
    MessageStatus["UNDELIVERED"] = "undelivered";
})(MessageStatus || (exports.MessageStatus = MessageStatus = {}));
// Conversation statuses
var ConversationStatus;
(function (ConversationStatus) {
    ConversationStatus["ACTIVE"] = "active";
    ConversationStatus["ARCHIVED"] = "archived";
    ConversationStatus["BLOCKED"] = "blocked";
})(ConversationStatus || (exports.ConversationStatus = ConversationStatus = {}));
