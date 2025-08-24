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
const supabase_1 = __importDefault(require("./routes/supabase"));
const import_1 = __importDefault(require("./routes/import"));
const trackingScheduler_1 = require("./scheduler/trackingScheduler");
const products_1 = __importDefault(require("./routes/products"));
const packages_1 = __importDefault(require("./routes/packages"));
const meta_1 = __importDefault(require("./routes/meta"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, "../.env.local") });
const app = (0, express_1.default)();
const port = Number(process.env.PORT) || 3001;
// IMPORTANT: Add these middleware to parse request bodies
app.use(express_1.default.json({ limit: "10mb" })); // Parse JSON bodies
app.use(express_1.default.urlencoded({ extended: true, limit: "10mb" })); // Parse URL-encoded bodies
// Enable CORS for frontend
// app.use((req, res, next) => {
//   res.header("Access-Control-Allow-Origin", "*");
//   res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
//   res.header(
//     "Access-Control-Allow-Headers",
//     "Content-Type, Authorization, Content-Length, X-Requested-With"
//   );
//   if (req.method === "OPTIONS") {
//     res.sendStatus(200);
//   } else {
//     next();
//   }
// });
// Mount the routes
app.use("/api", track_1.default);
app.use("/api", twilio_1.default);
app.use("/api/inbox", inbox_1.default);
app.use("/sync", sync_1.default);
app.use("/api", whatsapp_1.default);
app.use("/api/supabase", supabase_1.default);
app.use("/api/import", import_1.default);
app.use("/api/products", products_1.default);
app.use("/api/packages", packages_1.default);
app.use("/api/meta", meta_1.default);
app.get("/health", (req, res) => {
    res.json({
        status: "ok",
        timestamp: new Date().toISOString(),
    });
});
app.listen(port, "0.0.0.0", () => {
    console.log(`🚀 Server running on http://0.0.0.0:${port}`);
});
if (process.env.NODE_ENV === "production") {
    console.log("\n📅 Starting daily tracking automation...");
    (0, trackingScheduler_1.startDailyTrackingScheduler)();
}
