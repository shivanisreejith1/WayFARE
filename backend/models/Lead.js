import mongoose from "mongoose";

const LeadSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true, index: true },
    customer: {
      name: { type: String, default: null },
      phone: { type: String, default: null },
      email: { type: String, default: null },
    },
    travel: {
      destination: { type: String, default: null },
      departureCity: { type: String, default: null },
      travelDate: { type: String, default: null },
      travellers: { type: Number, default: null },
      budget: { type: String, default: null },
      duration: { type: String, default: null },
      tripType: { type: String, default: null },
      specialRequirements: { type: String, default: null },
    },
    qualification: {
      leadScore: { type: Number, required: true },
      confidence: { type: String, enum: ["Low", "Medium", "High"], required: true },
      reason: { type: String, default: "" },
      summary: { type: String, default: "" },
    },
    // true when contact info exists; lets a consultant filter "hot but no
    // phone yet" leads from fully actionable ones (see edge case in README)
    hasContact: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("Lead", LeadSchema);
