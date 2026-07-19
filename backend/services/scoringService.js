/**
 * The LLM proposes a contextual leadScore + reasoning every turn (it has the
 * full conversation, we don't). But we deliberately do NOT trust the LLM for
 * `confidence` or for the final "is this a lead" decision - those are
 * computed deterministically here, from the LLM's score plus how complete
 * the captured data actually is. Two reasons:
 *   1. Confidence should mean "how sure are we this number is right", which
 *      is a function of *how much evidence we have* (fields filled, turns
 *      taken), not something the model can judge about itself reliably.
 *   2. Deterministic post-processing means two conversations with the same
 *      underlying facts always get the same confidence label, even if the
 *      model's wording drifts turn to turn.
 */

const TRAVEL_FIELD_KEYS = [
  "destination",
  "departureCity",
  "travelDate",
  "travellers",
  "budget",
  "duration",
  "tripType",
  "specialRequirements",
];

export function clampScore(score) {
  const n = Number(score);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function completeness(travel) {
  const filled = TRAVEL_FIELD_KEYS.filter(
    (k) => travel[k] !== null && travel[k] !== undefined && travel[k] !== ""
  ).length;
  return filled / TRAVEL_FIELD_KEYS.length;
}

/**
 * Confidence = how much we'd trust this score if we handed it to a human
 * consultant right now. Needs both a reasonably high score AND enough
 * underlying detail to back it up - a single enthusiastic sentence can spike
 * the LLM's score, but shouldn't alone earn "High" confidence.
 */
export function computeConfidence({ score, travel, hasContact }) {
  const ratio = completeness(travel);

  if (score >= 70 && (ratio >= 0.4 || hasContact)) return "High";
  if (score >= 40 && (ratio >= 0.2 || hasContact)) return "Medium";
  if (score >= 25) return "Medium";
  return "Low";
}

/**
 * Detects a "cooling off" conversation: score peaked and then dropped
 * meaningfully in the most recent turns. Used to suppress a premature ask
 * for contact details, and to flag the lead as lower priority even if the
 * peak score was high.
 */
export function isInterestCooling(scoreHistory, currentScore, dropThreshold = 25) {
  if (scoreHistory.length < 2) return false;
  const peak = Math.max(...scoreHistory);
  return peak - currentScore >= dropThreshold;
}

export function shouldPersistAsLead({ score, customer, threshold }) {
  const hasContact = Boolean(customer?.name) && Boolean(customer?.phone);
  return hasContact && score >= threshold;
}

export { TRAVEL_FIELD_KEYS };
