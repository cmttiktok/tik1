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
app.use(express.static(__dirname)); // Cho phép truy cập file ngang hàng

// KẾT NỐI DATABASE
const MONGODB_URI = "mongodb+srv://baoboi97:baoboi97@cluster0.skkajlz.mongodb.net/tiktok_tts?retryWrites=true&w=majority&appName=Cluster0";
mongoose.connect(MONGODB_URI);

const Announcement = mongoose.model('Announcement', { text: String, color: String, isRainbow: Boolean });

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));

app.get('/api/announcement', async (req, res) => {
    let a = await Announcement.findOne();
    if (!a) a = await Announcement.create({ text: "Chào mừng bạn!", color: "#fe2c55", isRainbow: false });
    res.json(a);
});

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
        
        tiktok.connect().then(state => {
            socket.emit('status', `Đã kết nối: ${username}`);
        }).catch(err => socket.emit('status', "Lỗi: " + err.message));

        // Lấy Avatar và Nickname chính xác
        tiktok.on('roomUser', (data) => {
            socket.emit('room-info', {
                avatar: data.owner.avatarThumb.url_list[0],
                nickname: data.owner.nickname
            });
        });

        tiktok.on('chat', async (data) => {
            const audio = await getGoogleAudio(`${data.nickname} nói ${data.comment}`);
            socket.emit('audio-data', { type: 'chat', user: data.nickname, comment: data.comment, audio });
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Server chạy tại port ' + PORT));
