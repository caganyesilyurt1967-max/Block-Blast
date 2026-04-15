import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import crypto from "crypto";
import dns from "node:dns";

// DNS hatalarını aşmak için IPv4 zorlaması (Altın kural)
dns.setDefaultResultOrder('ipv4first');

import "./models/User.js";
import Score from "./models/Score.js";
import User from "./models/User.js";

const app = express();
const PORT = process.env.PORT || 4000;

// --- YAPILANDIRMA ---
// Yerel DNS sorunlarını aşan, SRV içermeyen direkt bağlantı linki
// ESKİ HALİ: const uri = "mongodb+srv://kullanici:SIFRE@cluster0...";
// YENİ HALİ:
const uri = process.env.MONGODB_URI;

// Hile koruması için gizli anahtar
const CLIENT_SALT = "CHANGE_ME_SUPER_SECRET_SALT";

// --- HİLE ENGELLEME: Hız Sınırı (Rate Limiting) ---
const WINDOW_MS = 10_000; 
const MAX_SUBMISSIONS_PER_WINDOW = 20; 
const BLOCK_DURATION_MS = 5 * 60_000; 
const ipSubmissionMap = new Map();

function getClientIp(req) {
  return req.headers["x-forwarded-for"]?.toString().split(",")[0].trim() || req.socket.remoteAddress || "unknown";
}

function checkRateLimit(req, res) {
  const ip = getClientIp(req);
  const now = Date.now();
  let info = ipSubmissionMap.get(ip);
  if (!info) { info = { count: 0, windowStart: now, blockedUntil: 0 }; ipSubmissionMap.set(ip, info); }
  if (info.blockedUntil && now < info.blockedUntil) {
    return { blocked: true, response: res.status(429).json({ ok: false, error: "Engellendiniz." }) };
  }
  if (now - info.windowStart > WINDOW_MS) { info.windowStart = now; info.count = 0; }
  info.count += 1;
  if (info.count > MAX_SUBMISSIONS_PER_WINDOW) {
    info.blockedUntil = now + BLOCK_DURATION_MS;
    return { blocked: true, response: res.status(429).json({ ok: false, error: "Şüpheli aktivite!" }) };
  }
  return { blocked: false };
}

// --- MONGODB BAĞLANTISI ---
async function connectDatabase() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log("✅ MongoDB bağlantısı kuruldu!");
  } catch (err) {
    console.error("❌ Bağlantı hatası:", err.message);
  }
}
connectDatabase();

app.use(cors());
app.use(express.json());

// --- HİLE ENGELLEME: GÜVENLİK SİSTEMLERİ ---
function verifyScoreHash({ score, timestamp, hash }) {
  if (typeof score !== "number" || !Number.isFinite(score)) return false;
  const payload = `${score}:${timestamp}:${CLIENT_SALT}`;
  const expectedHash = crypto.createHash("sha256").update(payload).digest("hex");
  return expectedHash === hash;
}

function isScorePlausible({ score, user }) {
  if (!Number.isInteger(score) || score < 0 || score > 10000000) return false;
  if (!user || !user.lastSubmissionAt || user.lastScore == null) return true;
  const elapsedMs = Date.now() - user.lastSubmissionAt.getTime();
  const scoreDelta = score - user.lastScore;
  const pointsPerSecond = scoreDelta / Math.max(elapsedMs / 1000, 1);
  return pointsPerSecond <= 10000; 
}

// --- ROTALAR ---
app.get("/api/leaderboard", async (req, res) => {
  try {
    const users = await User.find({}).sort({ bestScore: -1 }).limit(10).select("username bestScore -_id");
    res.json({ ok: true, leaderboard: users });
  } catch (err) { res.status(500).json({ ok: false }); }
});

app.post("/api/submit-score", async (req, res) => {
  const rate = checkRateLimit(req, res);
  if (rate.blocked) return rate.response;
  try {
    const { username, score, timestamp, hash } = req.body || {};
    if (!verifyScoreHash({ score, timestamp, hash })) return res.status(400).json({ ok: false, error: "İmza hatası!" });
    let user = await User.findOne({ username });
    if (!user) user = new User({ username, bestScore: 0 });
    if (!isScorePlausible({ score, user })) return res.status(400).json({ ok: false, error: "Geçersiz skor!" });
    if (score > (user.bestScore || 0)) user.bestScore = score;
    user.lastSubmissionAt = new Date();
    user.lastScore = score;
    await user.save();
    await Score.create({ user: user._id, value: score });
    res.json({ ok: true, bestScore: user.bestScore });
  } catch (err) { res.status(500).json({ ok: false }); }
});

app.listen(PORT, () => {
  console.log(`🚀 API çalışıyor: Port ${PORT}`);
});