import express from "express";
import dotenv from "dotenv";
import trackRouter from "./routes/track";
import path from "path";
import syncRouter from "./routes/sync";
import twilioRouter from "./routes/twilio";
import inboxRouter from "./routes/inbox";
import whatsappRouter from "./routes/whatsapp";
import { startDailyTrackingScheduler } from "./scheduler/trackingScheduler";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const app = express();
const port = Number(process.env.PORT) || 3001;

// IMPORTANT: Add these middleware to parse request bodies
app.use(express.json({ limit: "10mb" })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: "10mb" })); // Parse URL-encoded bodies

// Mount the routes
app.use("/api", trackRouter);
app.use("/api", twilioRouter);
app.use("/api/inbox", inboxRouter);
app.use("/sync", syncRouter);
app.use("/api", whatsappRouter);

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
  startDailyTrackingScheduler();
}
