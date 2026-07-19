import express from "express";
import Lead from "../models/Lead.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const leads = await Lead.find().sort({ createdAt: -1 }).limit(200);
  res.json(leads);
});

router.get("/:conversationId", async (req, res) => {
  const lead = await Lead.findOne({ conversationId: req.params.conversationId });
  if (!lead) return res.status(404).json({ error: "not found" });
  res.json(lead);
});

export default router;
