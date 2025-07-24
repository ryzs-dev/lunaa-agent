import express from "express";
import dotenv from "dotenv";
import trackRouter from "../routes/track";
import path from "path";
import syncRouter from "../routes/sync";
import twilioRouter from "../routes/twilio";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());

// Mount the route
app.use("/api", trackRouter);
app.use("/api", twilioRouter); // Now lives at /api/twilio/status
app.use("/sync", syncRouter);

app.listen(port, () => {
  console.log(`🚀 Server running on http://localhost:${port}`);
});
