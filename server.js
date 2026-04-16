const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Bağlantısı (Vercel Environment Variables'dan gelir)
const uri = process.env.MONGODB_URI;

// Bağlantı hatası durumunda sunucunun çökmemesi için kontrol
if (!uri) {
  console.error("HATA: MONGODB_URI tanımlı değil!");
}

mongoose.connect(uri)
  .then(() => console.log("MongoDB Bağlantısı Başarılı! ✅"))
  .catch(err => console.error("Bağlantı Hatası: ❌", err));

// MODELLER (Klasör ismin 'models' olduğu için yol bu şekilde)
const User = require('./models/User');
const Score = require('./models/Score');

// --- ROTALAR ---

app.get('/', (req, res) => {
  res.send('Blok Patlatma Sunucusu Aktif! 🛡️');
});

app.get('/leaderboard', async (req, res) => {
  try {
    const scores = await Score.find().populate('user').sort({ score: -1 }).limit(10);
    res.json(scores || []);
  } catch (err) {
    res.status(500).json({ error: "Skorlar alınamadı." });
  }
});

// HİLE KORUMALI SKOR KAYDETME
app.post('/add-score', async (req, res) => {
  const { username, score } = req.body;

  // 1. KORUMA: Tip ve Mantık Kontrolü
  if (typeof score !== 'number' || score > 1000000 || score < 0) {
    return res.status(403).json({ error: "Geçersiz skor!" });
  }

  try {
    let user = await User.findOne({ username });
    if (!user) {
      user = new User({ username });
      await user.save();
    }

    // 2. KORUMA: Zaman Kontrolü (Spam Engelleme)
    const lastScore = await Score.findOne({ user: user._id }).sort({ createdAt: -1 });
    
    if (lastScore && lastScore.createdAt) {
      const fark = (Date.now() - new Date(lastScore.createdAt).getTime()) / 1000;
      if (fark < 5) { 
        return res.status(429).json({ error: "Çok hızlı skor! 5 saniye bekle." });
      }
    }

    const newScore = new Score({ user: user._id, score: score });
    await newScore.save();
    
    res.json({ message: "Skor başarıyla kaydedildi!" });

  } catch (err) {
    res.status(500).json({ error: "Sunucu hatası!" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server Hazır"));

module.exports = app;
