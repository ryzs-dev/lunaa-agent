"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const track_1 = __importDefault(require("./routes/track"));
const path_1 = __importDefault(require("path"));
const sync_1 = __importDefault(require("./routes/sync"));
const twilio_1 = __importDefault(require("./routes/twilio"));
const inbox_1 = __importDefault(require("./routes/inbox"));
const whatsapp_1 = __importDefault(require("./routes/whatsapp"));
const supabase_1 = __importDefault(require("./routes/supabase"));
const trackingScheduler_1 = require("./scheduler/trackingScheduler");
const products_1 = __importDefault(require("./routes/products"));
const packages_1 = __importDefault(require("./routes/packages"));
const meta_1 = __importDefault(require("./routes/meta"));
const customers_1 = __importDefault(require("./routes/customers"));
const order_1 = require("./routes/order");
const address_1 = require("./routes/address");
const tracking_1 = require("./routes/tracking");
const route_1 = require("./routes/parcel-daily/route");
const route_2 = require("./routes/webhook/parcel-daily/route");
const import_1 = __importDefault(require("./routes/import"));
const route_3 = require("./routes/message/route");
const route_4 = require("./routes/stats/route");
const subscriber_1 = require("./modules/pubsub/subscriber");
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../.env.local') });
const app = (0, express_1.default)();
const port = Number(process.env.PORT) || 3001;
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
app.use((0, cors_1.default)());
(0, subscriber_1.initParcelDailySubscribers)();
// Mount the routes
app.use('/api', track_1.default);
app.use('/api', twilio_1.default);
app.use('/api/inbox', inbox_1.default);
app.use('/sync', sync_1.default);
app.use('/api', whatsapp_1.default);
app.use('/api/supabase', supabase_1.default);
app.use('/api/import', import_1.default);
app.use('/api/products', products_1.default);
app.use('/api/packages', packages_1.default);
app.use('/api/meta', meta_1.default);
app.use('/api/customers', customers_1.default);
app.use('/api/orders', order_1.orderRouter);
app.use('/api/addresses', address_1.addressRouter);
app.use('/api/tracking', tracking_1.orderTrackingRouter);
app.use('/api/parcel-daily', route_1.parcelDailyRouter);
app.use('/webhook', route_2.webhookRouter);
app.use('/api/message', route_3.messageRouter);
app.use('/api/stats', route_4.statsRouter);
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
    });
});
app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Server running on http://0.0.0.0:${port}`);
});
if (process.env.NODE_ENV === 'production') {
    console.log('\n📅 Starting daily tracking automation...');
    (0, trackingScheduler_1.startDailyTrackingScheduler)();
}
