import mongoose from "mongoose";

const scoreSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    value: { type: Number, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
  }
);

const Score = mongoose.models.Score || mongoose.model("Score", scoreSchema);

export default Score;
