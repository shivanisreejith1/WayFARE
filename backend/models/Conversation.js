import mongoose from "mongoose";

const MessageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

// Mirrors the "travel" fields we progressively extract. Every field is
// nullable because the whole point is that they get filled in over time.
const TravelFieldsSchema = new mongoose.Schema(
  {
    destination: { type: String, default: null },
    departureCity: { type: String, default: null },
    travelDate: { type: String, default: null }, // kept as free text on purpose, see README
    travellers: { type: Number, default: null },
    budget: { type: String, default: null },
    duration: { type: String, default: null },
    tripType: { type: String, default: null },
    specialRequirements: { type: String, default: null },
  },
  { _id: false }
);

const CustomerFieldsSchema = new mongoose.Schema(
  {
    name: { type: String, default: null },
    phone: { type: String, default: null },
    email: { type: String, default: null },
  },
  { _id: false }
);

const QualificationSchema = new mongoose.Schema(
  {
    leadScore: { type: Number, default: 0 },
    confidence: { type: String, enum: ["Low", "Medium", "High"], default: "Low" },
    reason: { type: String, default: "" },
    summary: { type: String, default: "" },
    contactAsked: { type: Boolean, default: false }, // guard: have we asked for contact yet
    contactDeclined: { type: Boolean, default: false }, // user was asked and said no
  },
  { _id: false }
);

const ConversationSchema = new mongoose.Schema(
  {
    conversationId: { type: String, required: true, unique: true, index: true },
    messages: { type: [MessageSchema], default: [] },
    travel: { type: TravelFieldsSchema, default: () => ({}) },
    customer: { type: CustomerFieldsSchema, default: () => ({}) },
    qualification: { type: QualificationSchema, default: () => ({}) },
    // scores over time, useful for detecting "interest dropped mid-conversation"
    scoreHistory: { type: [Number], default: [] },
    leadCreated: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.model("Conversation", ConversationSchema);
