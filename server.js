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

// KẾT NỐI DATABASE
const MONGODB_URI = "mongodb+srv://baoboi97:baoboi97@cluster0.skkajlz.mongodb.net/tiktok_tts?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(MONGODB_URI).then(() => console.log("✅ MongoDB Connected"));

const BannedWord = mongoose.model('BannedWord', { word: String });
const Acronym = mongoose.model('Acronym', { key: String, value: String });
const EmojiMap = mongoose.model('EmojiMap', { icon: String, text: String });
const BotAnswer = mongoose.model('BotAnswer', { keyword: String, response: String });
const Announcement = mongoose.model('Announcement', { text: String, color: String, isRainbow: Boolean });

// ĐIỀU HƯỚNG FILE
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// API THÔNG BÁO
app.get('/api/announcement', async (req, res) => {
    let a = await Announcement.findOne();
    if (!a) a = await Announcement.create({ text: "Chào mừng bạn đến với phiên live!", color: "#fe2c55", isRainbow: false });
    res.json(a);
});
app.post('/api/announcement', async (req, res) => {
    await Announcement.findOneAndUpdate({}, req.body, { upsert: true });
    res.sendStatus(200);
});

// CÁC API DỮ LIỆU KHÁC
app.get('/api/words', async (req, res) => res.json((await BannedWord.find()).map(w => w.word)));
app.post('/api/words', async (req, res) => { if (req.body.word) await new BannedWord({ word: req.body.word }).save(); res.sendStatus(200); });
app.delete('/api/words/:word', async (req, res) => { await BannedWord.deleteOne({ word: req.params.word }); res.sendStatus(200); });
app.get('/api/acronyms', async (req, res) => res.json(await Acronym.find()));
app.post('/api/acronyms', async (req, res) => { await new Acronym(req.body).save(); res.sendStatus(200); });
app.delete('/api/acronyms/:key', async (req, res) => { await Acronym.deleteOne({ key: req.params.key }); res.sendStatus(200); });
app.get('/api/emojis', async (req, res) => res.json(await EmojiMap.find()));
app.post('/api/emojis', async (req, res) => { await new EmojiMap(req.body).save(); res.sendStatus(200); });
app.delete('/api/emojis/:id', async (req, res) => { await EmojiMap.findByIdAndDelete(req.params.id); res.sendStatus(200); });
app.get('/api/bot', async (req, res) => res.json(await BotAnswer.find()));
app.post('/api/bot', async (req, res) => { await new BotAnswer(req.body).save(); res.sendStatus(200); });
app.delete('/api/bot/:id', async (req, res) => { await BotAnswer.findByIdAndDelete(req.params.id); res.sendStatus(200); });

// XỬ LÝ TTS
async function getGoogleAudio(text) {
    try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.substring(0, 200))}&tl=vi&client=tw-ob`;
        const res = await axios.get(url, { responseType: 'arraybuffer' });
        return `data:audio/mp3;base64,${Buffer.from(res.data, 'binary').toString('base64')}`;
    } catch (e) { return null; }
}

io.on('connection', (socket) => {
    let tiktok;
    socket.on('set-username', (username) => {
        if (tiktok) tiktok.disconnect();
        tiktok = new WebcastPushConnection(username);
        tiktok.connect().then(() => socket.emit('status', `Đã kết nối: ${username}`)).catch(() => socket.emit('status', "Lỗi kết nối"));

        tiktok.on('roomUser', (data) => {
            socket.emit('room-info', {
                avatar: data.owner.avatarThumb.url_list[0],
                nickname: data.owner.nickname
            });
        });

        tiktok.on('chat', async (data) => {
            const final = data.comment;
            const audio = await getGoogleAudio(`${data.nickname} nói: ${final}`);
            socket.emit('audio-data', { type: 'chat', user: data.nickname, comment: data.comment, audio });
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('🚀 Server ON: ' + PORT));
