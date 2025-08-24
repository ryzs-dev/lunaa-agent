import express from "express";
import dotenv from "dotenv";
import trackRouter from "./routes/track";
import path from "path";
import syncRouter from "./routes/sync";
import twilioRouter from "./routes/twilio";
import inboxRouter from "./routes/inbox";
import whatsappRouter from "./routes/whatsapp";
import supabaseRouter from "./routes/supabase";
import importRouter from "./routes/import";

import { startDailyTrackingScheduler } from "./scheduler/trackingScheduler";
import productsRouter from "./routes/products";
import packagesRouter from "./routes/packages";
import metaRouter from "./routes/meta";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const app = express();
const port = Number(process.env.PORT) || 3001;

// IMPORTANT: Add these middleware to parse request bodies
app.use(express.json({ limit: "10mb" })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: "10mb" })); // Parse URL-encoded bodies

// Enable CORS for frontend
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, Content-Length, X-Requested-With"
  );

  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Mount the routes
app.use("/api", trackRouter);
app.use("/api", twilioRouter);
app.use("/api/inbox", inboxRouter);
app.use("/sync", syncRouter);
app.use("/api", whatsappRouter);
app.use("/api/supabase", supabaseRouter);
app.use("/api/import", importRouter);
app.use("/api/products", productsRouter);
app.use("/api/packages", packagesRouter);
app.use("/api/meta", metaRouter);

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
