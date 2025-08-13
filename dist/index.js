"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const track_1 = __importDefault(require("./routes/track"));
const path_1 = __importDefault(require("path"));
const sync_1 = __importDefault(require("./routes/sync"));
const twilio_1 = __importDefault(require("./routes/twilio"));
const inbox_1 = __importDefault(require("./routes/inbox"));
const whatsapp_1 = __importDefault(require("./routes/whatsapp"));
const trackingScheduler_1 = require("./scheduler/trackingScheduler");
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../.env.local") });
const app = (0, express_1.default)();
const port = process.env.PORT || 3001;
// IMPORTANT: Add these middleware to parse request bodies
app.use(express_1.default.json({ limit: "10mb" })); // Parse JSON bodies
app.use(express_1.default.urlencoded({ extended: true, limit: "10mb" })); // Parse URL-encoded bodies
// Mount the routes
app.use("/api", track_1.default);
app.use("/api", twilio_1.default);
app.use("/api/inbox", inbox_1.default);
app.use("/sync", sync_1.default);
app.use("/api", whatsapp_1.default);
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
    });
});
app.listen(port, () => {
    console.log(`🚀 Server running on http://localhost:${port}`);
});
if (process.env.NODE_ENV === "production") {
    console.log("\n📅 Starting daily tracking automation...");
    (0, trackingScheduler_1.startDailyTrackingScheduler)();
}
