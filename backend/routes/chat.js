import express from "express";
import { v4 as uuidv4 } from "uuid";
import Conversation from "../models/Conversation.js";
import Lead from "../models/Lead.js";
import { runTurn } from "../services/llmService.js";
import {
  clampScore,
  computeConfidence,
  isInterestCooling,
  shouldPersistAsLead,
} from "../services/scoringService.js";

const router = express.Router();

const LEAD_SCORE_THRESHOLD = Number(process.env.LEAD_SCORE_THRESHOLD || 60);

/** Merge helper: only overwrite a stored field when the model gave us a
 * genuinely new non-null value. This is what lets state accumulate across
 * turns instead of getting wiped every time the model doesn't re-mention
 * something. */
function mergeNonNull(target, updates) {
  const merged = { ...target };
  for (const [key, value] of Object.entries(updates || {})) {
    if (value !== null && value !== undefined && value !== "") {
      merged[key] = value;
    }
  }
  return merged;
}

router.post("/", async (req, res) => {
  try {
    const { message } = req.body;
    let { conversationId } = req.body;

    if (!message || typeof message !== "string" || !message.trim()) {
      return res.status(400).json({ error: "message is required" });
    }

    let conversation;
    if (conversationId) {
      conversation = await Conversation.findOne({ conversationId });
    }
    if (!conversation) {
      conversationId = conversationId || `conv_${uuidv4().slice(0, 8)}`;
      conversation = await Conversation.create({ conversationId });
    }

    conversation.messages.push({ role: "user", content: message });

    const cooling = isInterestCooling(
      conversation.scoreHistory,
      conversation.qualification.leadScore
    );

    const llmResult = await runTurn({
      messages: conversation.messages,
      travel: conversation.travel,
      customer: conversation.customer,
      contactAsked: conversation.qualification.contactAsked,
      contactDeclined: conversation.qualification.contactDeclined,
      cooling,
    });

    // 1. merge extracted fields into running state
    conversation.travel = mergeNonNull(conversation.travel.toObject(), llmResult.extractedTravel);
    conversation.customer = mergeNonNull(conversation.customer.toObject(), llmResult.extractedCustomer);

    // 2. record assistant reply
    conversation.messages.push({ role: "assistant", content: llmResult.reply });

    // 3. score + confidence (confidence computed deterministically, see scoringService)
    const score = clampScore(llmResult.qualification.leadScore);
    const hasContact = Boolean(conversation.customer.name) && Boolean(conversation.customer.phone);
    const confidence = computeConfidence({ score, travel: conversation.travel, hasContact });

    conversation.qualification.leadScore = score;
    conversation.qualification.confidence = confidence;
    conversation.qualification.reason = llmResult.qualification.reason;
    conversation.qualification.summary = llmResult.qualification.summary;
    conversation.qualification.contactAsked =
      conversation.qualification.contactAsked || Boolean(llmResult.asksForContact);
    conversation.qualification.contactDeclined =
      conversation.qualification.contactDeclined || Boolean(llmResult.contactDeclined);

    conversation.scoreHistory.push(score);

    await conversation.save();

    // 4. decide whether this conversation is now a persisted, actionable lead
    let leadCreatedThisTurn = false;
    if (shouldPersistAsLead({ score, customer: conversation.customer, threshold: LEAD_SCORE_THRESHOLD })) {
      await Lead.findOneAndUpdate(
        { conversationId },
        {
          conversationId,
          customer: conversation.customer,
          travel: conversation.travel,
          qualification: {
            leadScore: score,
            confidence,
            reason: conversation.qualification.reason,
            summary: conversation.qualification.summary,
          },
          hasContact,
        },
        { upsert: true, new: true }
      );
      if (!conversation.leadCreated) {
        conversation.leadCreated = true;
        await conversation.save();
        leadCreatedThisTurn = true;
      }
    }

    return res.json({
      conversationId,
      reply: llmResult.reply,
      state: {
        travel: conversation.travel,
        customer: conversation.customer,
        qualification: conversation.qualification,
      },
      leadCreated: conversation.leadCreated,
      leadCreatedThisTurn,
      interestCooling: cooling,
    });
  } catch (err) {
    console.error("[chat] error:", err);
    return res.status(500).json({ error: err.message || "internal error" });
  }
});

// fetch full state for a conversation (e.g. on page refresh)
router.get("/:conversationId", async (req, res) => {
  const conversation = await Conversation.findOne({ conversationId: req.params.conversationId });
  if (!conversation) return res.status(404).json({ error: "not found" });
  return res.json(conversation);
});

export default router;
