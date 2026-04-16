const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// MongoDB Bağlantısı (Vercel Environment Variables'dan çeker)
const uri = process.env.MONGODB_URI;

mongoose.connect(uri)
  .then(() => console.log("MongoDB bağlantısı başarılı!"))
  .catch(err => console.error("MongoDB bağlantı hatası:", err));

// Modellerini İçeri Aktar (Dosyalar en dışta olduğu için yol bu şekilde)
const User = require('./User');
const Score = require('./Score');

// --- ROTALAR (ROUTES) ---

// 1. Test Rotası (Çalışıp çalışmadığını anlamak için)
app.get('/', (req, res) => {
  res.send('Blok Patlatma Sunucusu Aktif! /leaderboard adresine gitmeyi dene.');
});

// 2. Skorları Getir (Leaderboard)
app.get('/leaderboard', async (req, res) => {
  try {
    const scores = await Score.find().populate('user').sort({ score: -1 }).limit(10);
    res.json(scores);
  } catch (err) {
    res.status(500).json({ error: "Skorlar alınamadı." });
  }
});

// 3. Yeni Skor Kaydet
app.post('/add-score', async (req, res) => {
  const { username, score } = req.body;
  try {
    let user = await User.findOne({ username });
    if (!user) {
      user = new User({ username });
      await user.save();
    }
    const newScore = new Score({ user: user._id, score });
    await newScore.save();
    res.json({ message: "Skor başarıyla kaydedildi!" });
  } catch (err) {
    res.status(500).json({ error: "Skor kaydedilemedi." });
  }
});

// Vercel için port ayarı
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});

module.exports = app;
