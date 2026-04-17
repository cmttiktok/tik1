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

const MONGODB_URI = "mongodb+srv://baoboi97:baoboi97@cluster0.skkajlz.mongodb.net/tiktok_tts?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(MONGODB_URI).then(() => console.log("✅ MongoDB Connected"));

const BannedWord = mongoose.model('BannedWord', { word: String });
const EmojiMap = mongoose.model('EmojiMap', { icon: String, text: String });

async function getGoogleAudio(text) {
    try {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text.substring(0, 200))}&tl=vi&client=tw-ob`;
        const res = await axios.get(url, { responseType: 'arraybuffer' });
        return `data:audio/mp3;base64,${Buffer.from(res.data, 'binary').toString('base64')}`;
    } catch (e) { return null; }
}

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

io.on('connection', (socket) => {
    let tiktok;
    socket.on('set-username', (username) => {
        if (tiktok) tiktok.disconnect();
        tiktok = new WebcastPushConnection(username);
        
        tiktok.connect().then(state => {
            socket.emit('status', `Đã kết nối: ${username}`);
            // Gửi số follow ngay khi vừa kết nối thành công
            if(state.roomInfo) socket.emit('room-info', { followerCount: state.roomInfo.stats.followerCount });
        }).catch(() => socket.emit('status', 'Lỗi kết nối!'));

        // Cập nhật số follow liên tục mỗi khi có thay đổi trong phòng
        tiktok.on('roomUser', (data) => {
            if(data.followerCount) {
                socket.emit('room-info', { followerCount: data.followerCount });
            }
        });

        tiktok.on('chat', async (data) => {
            const audio = await getGoogleAudio(`${data.nickname} nói: ${data.comment}`);
            socket.emit('audio-data', { type: 'chat', user: data.nickname, comment: data.comment, audio });
        });

        tiktok.on('gift', async (data) => {
            if (data.repeatEnd) {
                const audio = await getGoogleAudio(`Cảm ơn ${data.nickname} đã tặng ${data.giftName}`);
                socket.emit('audio-data', { type: 'gift', user: "QUÀ", comment: `${data.nickname} tặng ${data.giftName}`, audio });
            }
        });
    });
});

server.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));
