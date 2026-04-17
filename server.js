const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');
const axios = require('axios');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.json());
app.use(express.static('public')); // Nếu bạn để file html trong thư mục public

const MONGODB_URI = "mongodb+srv://baoboi97:baoboi97@cluster0.skkajlz.mongodb.net/tiktok_tts?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(MONGODB_URI).then(() => console.log("✅ MongoDB Connected"));

const BannedWord = mongoose.model('BannedWord', { word: String });
const Acronym = mongoose.model('Acronym', { key: String, value: String });
const EmojiMap = mongoose.model('EmojiMap', { icon: String, text: String });
const BotAnswer = mongoose.model('BotAnswer', { keyword: String, response: String });

// --- API QUẢN TRỊ ---
app.get('/api/words', async (req, res) => res.json((await BannedWord.find()).map(w => w.word)));
app.post('/api/words', async (req, res) => {
    const word = req.body.word;
    if (word) await new BannedWord({ word }).save();
    res.json({ success: true });
});
app.delete('/api/words/:word', async (req, res) => {
    await BannedWord.deleteOne({ word: req.params.word });
    res.json({ success: true });
});

app.get('/api/acronyms', async (req, res) => res.json(await Acronym.find()));
app.post('/api/acronyms', async (req, res) => {
    await new Acronym(req.body).save();
    res.json({ success: true });
});
app.delete('/api/acronyms/:key', async (req, res) => {
    await Acronym.deleteOne({ key: req.params.key });
    res.json({ success: true });
});

app.get('/api/emojis', async (req, res) => res.json(await EmojiMap.find()));
app.post('/api/emojis', async (req, res) => {
    await new EmojiMap(req.body).save();
    res.json({ success: true });
});
app.delete('/api/emojis/:id', async (req, res) => {
    await EmojiMap.deleteOne({ _id: req.params.id });
    res.json({ success: true });
});

app.get('/api/bot', async (req, res) => res.json(await BotAnswer.find()));
app.post('/api/bot', async (req, res) => {
    await new BotAnswer(req.body).save();
    res.json({ success: true });
});
app.delete('/api/bot/:id', async (req, res) => {
    await BotAnswer.deleteOne({ _id: req.params.id });
    res.json({ success: true });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// --- LOGIC TIKTOK ---
async function getGoogleAudio(text) {
    try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=vi&client=tw-ob`;
        return url;
    } catch (e) { return null; }
}

io.on('connection', (socket) => {
    let tiktok = null;

    socket.on('set-username', (username) => {
        if (tiktok) tiktok.disconnect();
        
        tiktok = new WebcastPushConnection(username);
        tiktok.connect().then(() => socket.emit('status', 'Đã kết nối: ' + username))
            .catch(() => socket.emit('status', 'Lỗi kết nối!'));

        // CẬP NHẬT FOLLOW & THÔNG TIN PHÒNG
        tiktok.on('roomUser', (data) => {
            socket.emit('room-info', { followerCount: data.followerCount });
        });

        tiktok.on('chat', async (data) => {
            // Logic xử lý chat cũ của bạn...
            socket.emit('audio-data', { type: 'chat', user: data.nickname, comment: data.comment, audio: await getGoogleAudio(data.comment) });
        });

        tiktok.on('gift', async (data) => {
            if (data.repeatEnd) {
                const audio = await getGoogleAudio(`Cảm ơn ${data.nickname} đã tặng ${data.giftName}`);
                socket.emit('audio-data', { type: 'gift', user: "QUÀ", comment: `${data.nickname} tặng ${data.giftName}`, audio });
            }
        });

        tiktok.on('member', async (data) => {
            const audio = await getGoogleAudio(`Chào mừng ${data.nickname} đã đến với buổi live`);
            socket.emit('audio-data', { type: 'welcome', user: "Hệ thống", comment: `${data.nickname} vào`, audio });
        });
    });
});

server.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));
