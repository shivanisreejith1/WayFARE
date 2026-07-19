import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";

import { connectDB } from "./config/db.js";
import chatRoutes from "./routes/chat.js";
import leadsRoutes from "./routes/leads.js";

const app = express();

app.use(cors());
app.use(express.json());

// API routes
app.get("/api/health", (req, res) => res.json({ ok: true }));
app.use("/api/chat", chatRoutes);
app.use("/api/leads", leadsRoutes);

// Serve Vite frontend
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const frontendPath = path.join(__dirname, "../frontend/dist");

app.use(express.static(frontendPath));

// Send index.html for frontend routes
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () =>
      console.log(`[server] listening on port ${PORT}`)
    );
  })
  .catch((err) => {
    console.error(
      "[server] failed to connect to MongoDB:",
      err.message
    );
    process.exit(1);
  });