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
mongoose.connect(MONGODB_URI);

const BannedWord = mongoose.model('BannedWord', { word: String });
const Acronym = mongoose.model('Acronym', { key: String, value: String });
const EmojiMap = mongoose.model('EmojiMap', { icon: String, text: String });
const BotAnswer = mongoose.model('BotAnswer', { keyword: String, response: String });

// ĐƯỜNG DẪN FILE (Đã sửa để nhận file ngang hàng)
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

// --- API KẾT NỐI (Giữ nguyên để Admin hoạt động) ---
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

// LOGIC XỬ LÝ CHAT & TTS
async function processText(text) {
    if (!text) return null;
    let processed = text;
    const emojis = await EmojiMap.find();
    emojis.forEach(e => { processed = processed.split(e.icon).join(" " + e.text + " "); });
    const acronyms = await Acronym.find();
    acronyms.forEach(a => {
        const regex = new RegExp(`(?<!\\p{L})${a.key}(?!\\p{L})`, 'giu');
        processed = processed.replace(regex, a.value);
    });
    return processed;
}

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
        tiktok.connect().then(() => socket.emit('status', `Đã kết nối: ${username}`)).catch(() => socket.emit('status', "Lỗi kết nối TikTok"));

        tiktok.on('chat', async (data) => {
            const botRules = await BotAnswer.find();
            const match = botRules.find(r => data.comment.toLowerCase().includes(r.keyword.toLowerCase()));
            if (match) {
                const audio = await getGoogleAudio(match.response);
                socket.emit('audio-data', { type: 'bot', user: "TRỢ LÝ", comment: match.response, audio });
            }
            const final = await processText(data.comment);
            if (final) {
                const audio = await getGoogleAudio(`${data.nickname} nói: ${final}`);
                socket.emit('audio-data', { type: 'chat', user: data.nickname, comment: data.comment, audio });
            }
        });
        tiktok.on('gift', async (data) => {
            if (data.repeatEnd) {
                const audio = await getGoogleAudio(`Cảm ơn ${data.nickname} đã tặng ${data.giftName}`);
                socket.emit('audio-data', { type: 'gift', user: "QUÀ", comment: `${data.nickname} tặng ${data.giftName}`, audio });
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('🚀 Server running on port ' + PORT));
