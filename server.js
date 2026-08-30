/**
 * ============================================================================
 *  MATEX — ÇOK OYUNCULU SUNUCU
 * ============================================================================
 *  Tek dosya. Kurulum:
 *      npm install
 *      node server.js
 *  Sonra tarayıcıda: http://localhost:3000
 *
 *  4 mod: Fotoğrafsız Soru · Fotoğraflı Soru · Bulanık Tahmin · Hızlı Görsel
 *  2-4 oyuncu · oda adı + şifre · kurucu başlatmadan oyun başlamaz
 * ============================================================================
 */

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e6 });

// Oyun sayfası ve görseller bu klasörden servis edilir.
// HTML'i ve tüm görselleri public/ içine koy.
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------- SORU VERİSİ
const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', 'sorular.json'), 'utf8'));

const MODLAR = {
    text:  { ad: 'Fotoğrafsız Soru', icon: '📝' },
    photo: { ad: 'Fotoğraflı Soru',  icon: '🖼️' },
    blur:  { ad: 'Bulanık Tahmin',   icon: '👁️' },
    hizli: { ad: 'Hızlı Görsel',     icon: '⚡' }
};

// Bulanık Tahmin seviyeleri — senin blurLevels tablonla aynı puanlar
const BLUR_SEVIYE = [
    { blur: 32, brightness: 0.7, points: 1000, label: '%10 - Çok Bulanık' },
    { blur: 20, brightness: 0.8, points: 700,  label: '%30 - Bulanık' },
    { blur: 12, brightness: 0.9, points: 400,  label: '%55 - Orta' },
    { blur: 5,  brightness: 1,   points: 200,  label: '%80 - Netleşiyor' },
    { blur: 0,  brightness: 1,   points: 50,   label: '%100 - Tam Net' }
];
const BLUR_SURE = 25;      // saniye — 5 seviye × 5 sn
const HIZLI_SURE = 12;     // saniye — flaş + cevap süresi
const SONUC_EKRANI_SN = 10; // sonuç ekranı kaç sn kalsın, sonra otomatik odaya dön

// ---------------------------------------------------------- EKSİK GÖRSEL FİLTRESİ
// Dosyası public/ içinde olmayan görselleri havuzdan çıkarır.
// (Sende kırık olan görseller varsa oyun onları hiç sormaz.)
const PUBLIC_DIR = path.join(__dirname, 'public');
function gorselVarMi(dosya) {
    if (!dosya) return false;
    try { return fs.statSync(path.join(PUBLIC_DIR, dosya)).isFile(); } catch (e) { return false; }
}
// Önce yerelde kaç görsel olduğuna bak.
// public/ içinde hiç görsel yoksa kullanıcı resimleri yüklememiş demektir;
// bu durumda HİÇBİR ŞEY ELEME — istemcideki Vercel yedeği görselleri getirir.
let yerelGorsel = 0;
try {
    yerelGorsel = fs.readdirSync(PUBLIC_DIR)
        .filter(f => /\.(png|jpe?g|webp|avif|gif)$/i.test(f)).length;
} catch (e) { yerelGorsel = 0; }

const FILTRE_ACIK = yerelGorsel >= 100;
const eksikGorseller = [];
if (!FILTRE_ACIK) {
    console.log('ℹ️  public/ içinde ' + yerelGorsel + ' görsel var — eksik görsel filtresi KAPALI.');
    console.log('   Görseller gerektiğinde https://matexquiz.vercel.app adresinden yüklenecek.');
}
if (FILTRE_ACIK) ['photo', 'blur', 'hizli'].forEach(mod => {
    Object.entries(DATA[mod]).forEach(([kat, v]) => {
        const items = mod === 'photo' ? v : v.items;
        const once = items.length;
        // photo modunda image=null olabilir: bunlar "emoji quiz"dir, kocaman emoji gösterilir → geçerli
        const temiz = items.filter(it => {
            const dosya = mod === 'photo' ? it.image : it.file;
            if (mod === 'photo' && !dosya) return true;
            return gorselVarMi(dosya);
        });
        if (temiz.length < once) eksikGorseller.push(`${mod}/${kat}: ${once - temiz.length} eksik`);
        if (mod === 'photo') DATA[mod][kat] = temiz; else DATA[mod][kat].items = temiz;
    });
    // boşalan kategorileri sil
    Object.keys(DATA[mod]).forEach(kat => {
        const v = DATA[mod][kat];
        const n = mod === 'photo' ? v.length : v.items.length;
        if (n === 0) delete DATA[mod][kat];
    });
});
if (eksikGorseller.length) {
    console.log('⚠️  Görseli bulunamadığı için elenen kayıtlar: ' + eksikGorseller.join(', '));
}

// ---------------------------------------------------------- YARDIMCILAR
const KOD_HARF = 'ABCDEFGHJKLMNPRSTUVYZ23456789'; // I, O, 0, 1 yok (okunabilirlik)
function yeniKod() {
    let k;
    do {
        k = '';
        for (let i = 0; i < 5; i++) k += KOD_HARF[Math.floor(Math.random() * KOD_HARF.length)];
    } while (rooms.has(k));
    return k;
}

function karistir(d) {
    const a = d.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

/** Türkçe karakterleri sadeleştirip karşılaştırılabilir hâle getirir */
function normalize(s) {
    return String(s || '')
        .toLowerCase()
        .replace(/ı/g, 'i').replace(/İ/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
        .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c')
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// ---------------------------------------------------------- ODA DEPOSU
const rooms = new Map();      // kod -> room
const socketRoom = new Map(); // socket.id -> kod

function timerEkle(room, fn, ms) {
    const t = setTimeout(() => {
        room.timers = room.timers.filter(x => x !== t);
        if (rooms.has(room.kod)) fn();
    }, ms);
    room.timers.push(t);
    return t;
}
function timerleriTemizle(room) {
    room.timers.forEach(clearTimeout);
    room.timers = [];
}

// ---------------------------------------------------------- SORU ÜRETİCİLERİ
function sorulariUret(room) {
    const { mod, kategori, soruSayisi } = room;
    const n = Math.max(1, Math.min(20, soruSayisi));

    if (mod === 'text') {
        const havuz = DATA.text[kategori] || DATA.text.genelkultur || [];
        return karistir(havuz).slice(0, n).map(q => {
            const harfler = ['A', 'B', 'C', 'D', 'E'].filter(h => q[h] !== undefined);
            const degerler = karistir(harfler.map(h => q[h]));
            const yeni = { tip: 'text', soru: q.soru, aciklama: q.aciklama || '' };
            harfler.forEach((h, i) => { yeni[h] = degerler[i]; });
            yeni.dogru = harfler[degerler.indexOf(q[q.dogru])];
            return yeni;
        });
    }

    if (mod === 'photo') {
        const havuz = DATA.photo[kategori] || Object.values(DATA.photo)[0] || [];
        return karistir(havuz).slice(0, n).map(it => ({
            tip: 'photo', prompt: it.prompt, label: it.label,
            answers: it.answers || [], emoji: it.emoji, image: it.image
        }));
    }

    if (mod === 'blur') {
        const cat = DATA.blur[kategori] || Object.values(DATA.blur)[0];
        const havuz = (cat && cat.items) || [];
        return karistir(havuz).slice(0, n).map(it => ({
            tip: 'blur', name: it.name, emoji: it.emoji, file: it.file
        }));
    }

    if (mod === 'hizli') {
        const cat = DATA.hizli[kategori] || Object.values(DATA.hizli)[0];
        const havuz = (cat && cat.items) || [];
        const secilen = karistir(havuz).slice(0, n);
        return secilen.map(it => {
            const yanlislar = karistir(havuz.filter(x => x.name !== it.name))
                .slice(0, 3).map(x => x.name);
            const secenekler = karistir([it.name, ...yanlislar]);
            return {
                tip: 'hizli', name: it.name, emoji: it.emoji, file: it.file,
                secenekler, dogru: it.name
            };
        });
    }
    return [];
}

function modSuresi(room) {
    if (room.mod === 'blur') return BLUR_SURE;
    if (room.mod === 'hizli') return HIZLI_SURE;
    return room.soruSuresi;
}

/** İstemciye gidecek soru — DOĞRU CEVAP YOK */
function soruPublic(q) {
    if (q.tip === 'text') {
        const { dogru, aciklama, ...rest } = q;
        return rest;
    }
    if (q.tip === 'photo') return { tip: 'photo', prompt: q.prompt, emoji: q.emoji, image: q.image };
    if (q.tip === 'blur') return { tip: 'blur', emoji: q.emoji, file: q.file, seviyeler: BLUR_SEVIYE.map(s => ({ label: s.label, points: s.points })) };
    if (q.tip === 'hizli') return { tip: 'hizli', emoji: q.emoji, file: q.file, secenekler: q.secenekler };
    return null;
}

// ---------------------------------------------------------- ODAYI YAYINLA
function roomPublic(room) {
    const players = room.players.map(p => ({
        id: p.id, name: p.name, avatar: p.avatar, host: p.host,
        score: p.score, correct: p.correct, wrong: p.wrong, answered: p.answered !== null
    }));
    const q = room.sorular[room.qIndex];
    const out = {
        kod: room.kod,
        ad: room.ad,
        sifreli: !!room.sifre,
        hostId: room.hostId,
        mod: room.mod,
        kategori: room.kategori,
        soruSayisi: room.soruSayisi,
        soruSuresi: room.soruSuresi,
        state: room.state,
        qIndex: room.qIndex,
        total: room.sorular.length,
        sure: modSuresi(room),
        players,
        question: room.state === 'playing' && q ? soruPublic(q) : null,
        review: null,
        results: null
    };

    if (room.state === 'review' && q) {
        out.review = {
            index: room.qIndex,
            tip: q.tip,
            dogruMetin: q.tip === 'text' ? `${q.dogru}) ${q[q.dogru]}`
                : q.tip === 'photo' ? q.label
                : q.tip === 'blur' ? q.name
                : q.dogru,
            aciklama: q.aciklama || '',
            answers: room.players.map(p => ({
                id: p.id, name: p.name, avatar: p.avatar,
                metin: p.sonCevapMetin || (p.sonCevap == null ? null : String(p.sonCevap)),
                dogruMu: p.sonDogruMu,
                puan: p.sonPuan
            }))
        };
    }

    if (room.state === 'finished') {
        out.results = room.players.slice()
            .sort((a, b) => (b.correct - a.correct) || (b.score - a.score))
            .map((p, i) => ({
                id: p.id, name: p.name, avatar: p.avatar,
                correct: p.correct, wrong: p.wrong, score: p.score,
                sira: i + 1, sampiyon: i === 0
            }));
    }
    return out;
}

function broadcast(kod) {
    const room = rooms.get(kod);
    if (!room) return;
    io.to(kod).emit('room', roomPublic(room));
}

function skorYayinla(room) {
    io.to(room.kod).emit('scores', room.players.map(p => ({
        id: p.id, name: p.name, avatar: p.avatar,
        score: p.score, correct: p.correct, wrong: p.wrong, answered: p.answered !== null
    })));
}

// ---------------------------------------------------------- OYUN AKIŞI
function oyunBaslat(room) {
    timerleriTemizle(room);
    room.sorular = sorulariUret(room);
    if (!room.sorular.length) {
        io.to(room.kod).emit('toast', 'Bu kategoride soru bulunamadı.');
        return;
    }
    room.players.forEach(p => {
        p.score = 0; p.correct = 0; p.wrong = 0;
        p.answered = null; p.sonCevap = null; p.sonCevapMetin = null; p.sonDogruMu = false; p.sonPuan = 0;
    });
    room.qIndex = 0;
    room.state = 'countdown';
    broadcast(room.kod);
    timerEkle(room, () => soruBaslat(room), 3300);
}

function soruBaslat(room) {
    room.state = 'playing';
    room.players.forEach(p => {
        p.answered = null; p.sonCevap = null; p.sonCevapMetin = null; p.sonDogruMu = false; p.sonPuan = 0;
    });
    room.qStart = Date.now();
    room.soruSure = modSuresi(room);
    broadcast(room.kod);
    timerEkle(room, () => soruBitir(room), room.soruSure * 1000 + 500);
}

function soruBitir(room) {
    room.state = 'review';
    broadcast(room.kod);
    timerEkle(room, () => sonrakiSoru(room), 4200);
}

function sonrakiSoru(room) {
    room.qIndex++;
    if (room.qIndex >= room.sorular.length) {
        room.state = 'finished';
        room.players.forEach(p => { p.answered = null; });
        broadcast(room.kod);
        // Sonuç ekranı gösterildikten sonra herkesi otomatik olarak odaya geri at
        timerEkle(room, () => {
            if (room.state !== 'finished') return;
            room.state = 'lobby';
            broadcast(room.kod);
            io.to(room.kod).emit('toast', 'Odaya dönüldü — kurucu yeni mod seçip tekrar başlatabilir.');
        }, SONUC_EKRANI_SN * 1000);
    } else {
        soruBaslat(room);
    }
}

function herkesCevapladiysa(room) {
    if (!room.players.every(p => p.answered !== null)) return;
    timerleriTemizle(room);
    room.state = 'review';
    broadcast(room.kod);
    timerEkle(room, () => sonrakiSoru(room), 4200);
}

/** Cevabı puanla — TÜM puanlama burada, istemcide değil */
function cevapIsle(room, player, cevap) {
    if (room.state !== 'playing' || player.answered !== null) return;
    const q = room.sorular[room.qIndex];
    const gecenSure = (Date.now() - room.qStart) / 1000;
    const kalan = Math.max(0, room.soruSure - gecenSure);
    let dogruMu = false, puan = 0, metin = '';

    if (q.tip === 'text') {
        if (!['A', 'B', 'C', 'D', 'E'].includes(cevap)) return;
        dogruMu = cevap === q.dogru;
        metin = `${cevap}) ${q[cevap] || ''}`;
        puan = dogruMu ? 100 + Math.round((kalan / room.soruSure) * 50) : 0;
    }
    else if (q.tip === 'photo') {
        metin = String(cevap || '').trim();
        if (!metin) return;
        const giris = normalize(metin);
        dogruMu = (q.answers || []).some(a => {
            const n = normalize(a);
            return n && (giris === n || giris.includes(n) || n.includes(giris));
        });
        puan = dogruMu ? 150 : 0;
    }
    else if (q.tip === 'blur') {
        metin = String(cevap || '').trim();
        if (!metin) return;
        const giris = normalize(metin);
        const hedef = normalize(q.name);
        dogruMu = giris === hedef || giris.includes(hedef) || hedef.includes(giris);
        // Hangi netlik seviyesinde cevapladıysa o seviyenin puanı
        const seviyeIdx = Math.min(BLUR_SEVIYE.length - 1, Math.floor((gecenSure / BLUR_SURE) * BLUR_SEVIYE.length));
        puan = dogruMu ? BLUR_SEVIYE[seviyeIdx].points : 0;
    }
    else if (q.tip === 'hizli') {
        if (!(q.secenekler || []).includes(cevap)) return;
        dogruMu = cevap === q.dogru;
        metin = cevap;
        puan = dogruMu ? 100 + Math.round((kalan / room.soruSure) * 50) : 0;
    }

    player.answered = cevap;
    player.sonCevap = cevap;
    player.sonCevapMetin = metin;
    player.sonDogruMu = dogruMu;
    player.sonPuan = puan;
    if (dogruMu) { player.correct++; player.score += puan; }
    else player.wrong++;

    skorYayinla(room);
    herkesCevapladiysa(room);
}

// ---------------------------------------------------------- AYAR DOĞRULAMA
function kategoriGecerli(mod, kat) {
    if (mod === 'text') return !!DATA.text[kat];
    if (mod === 'photo') return !!DATA.photo[kat];
    if (mod === 'blur') return !!DATA.blur[kat];
    if (mod === 'hizli') return !!DATA.hizli[kat];
    return false;
}
function ilkKategori(mod) {
    const src = DATA[mod];
    return src ? Object.keys(src)[0] : null;
}

// ---------------------------------------------------------- SOCKET
io.on('connection', (socket) => {

    // ---------------- ODA KUR ----------------
    socket.on('room:create', ({ name, avatar, roomName, password, mode } = {}, cb) => {
        const ad = String(name || '').trim().slice(0, 20);
        if (ad.length < 2) return cb && cb({ ok: false, error: 'Profil adın en az 2 karakter olmalı.' });

        const mod = MODLAR[mode] ? mode : 'text';
        const room = {
            kod: yeniKod(),
            ad: String(roomName || '').trim().slice(0, 24) || (ad + "'ın Odası"),
            sifre: String(password || '').trim().slice(0, 20),
            hostId: socket.id,
            mod,
            kategori: ilkKategori(mod),
            soruSayisi: 5,
            soruSuresi: 20,
            state: 'lobby',
            qIndex: 0,
            qStart: 0,
            soruSure: 20,
            sorular: [],
            timers: [],
            sonAktivite: Date.now(),
            players: [{
                id: socket.id, name: ad, avatar: avatar || '👤', host: true,
                score: 0, correct: 0, wrong: 0,
                answered: null, sonCevap: null, sonCevapMetin: null, sonDogruMu: false, sonPuan: 0
            }]
        };
        rooms.set(room.kod, room);
        socketRoom.set(socket.id, room.kod);
        socket.join(room.kod);
        cb && cb({ ok: true, room: roomPublic(room) });
    });

    // ---------------- ODAYA KATIL ----------------
    socket.on('room:join', ({ code, name, avatar, password } = {}, cb) => {
        const kod = String(code || '').trim().toUpperCase();
        const room = rooms.get(kod);
        if (!room) return cb && cb({ ok: false, error: 'Bu kodda oda bulunamadı. Kodu kontrol et.' });
        if (room.players.length >= 4) return cb && cb({ ok: false, error: 'Oda dolu (en fazla 4 kişi).' });
        if (room.state !== 'lobby' && room.state !== 'finished')
            return cb && cb({ ok: false, error: 'Bu odada oyun sürüyor, şu an katılamazsın.' });
        if (room.sifre && String(password || '') !== room.sifre)
            return cb && cb({ ok: false, needPassword: true, error: 'Şifre hatalı.' });

        const ad = String(name || '').trim().slice(0, 20);
        if (ad.length < 2) return cb && cb({ ok: false, error: 'Profil adın en az 2 karakter olmalı.' });
        if (room.players.some(p => p.name.toLowerCase() === ad.toLowerCase()))
            return cb && cb({ ok: false, error: 'Bu isim odada zaten var, başka bir isim kullan.' });

        room.players.push({
            id: socket.id, name: ad, avatar: avatar || '👤', host: false,
            score: 0, correct: 0, wrong: 0,
            answered: null, sonCevap: null, sonCevapMetin: null, sonDogruMu: false, sonPuan: 0
        });
        room.sonAktivite = Date.now();
        socketRoom.set(socket.id, kod);
        socket.join(kod);
        cb && cb({ ok: true, room: roomPublic(room) });
        io.to(kod).emit('toast', `${ad} odaya katıldı.`);
        broadcast(kod);
    });

    // ---------------- AYARLAR (yalnızca kurucu) ----------------
    socket.on('room:setSettings', (s = {}) => {
        const room = rooms.get(socketRoom.get(socket.id));
        if (!room || room.hostId !== socket.id) return;
        if (room.state !== 'lobby' && room.state !== 'finished') return;

        if (s.mode && MODLAR[s.mode]) {
            if (s.mode !== room.mod) {
                room.mod = s.mode;
                room.kategori = ilkKategori(s.mode);
            }
        }
        if (s.category && kategoriGecerli(room.mod, s.category)) room.kategori = s.category;
        const n = Number(s.questionCount);
        if (Number.isFinite(n) && n >= 1 && n <= 20) room.soruSayisi = Math.floor(n);
        const t = Number(s.seconds);
        if (Number.isFinite(t) && t >= 5 && t <= 120) room.soruSuresi = Math.floor(t);
        room.sonAktivite = Date.now();
        broadcast(room.kod);
    });

    // ---------------- OYUNU BAŞLAT (yalnızca kurucu) ----------------
    socket.on('game:start', () => {
        const room = rooms.get(socketRoom.get(socket.id));
        if (!room || room.hostId !== socket.id) return;
        if (room.state !== 'lobby' && room.state !== 'finished') return;
        if (room.players.length < 2)
            return socket.emit('toast', 'Başlamak için en az 2 kişi lazım. Oda kodunu arkadaşına gönder.');
        oyunBaslat(room);
    });

    // ---------------- SONUÇTAN ODAYA DÖN ----------------
    socket.on('room:toLobby', () => {
        const room = rooms.get(socketRoom.get(socket.id));
        if (!room || room.state !== 'finished') return;
        timerleriTemizle(room);
        room.state = 'lobby';
        broadcast(room.kod);
    });

    // ---------------- CEVAP ----------------
    socket.on('answer:submit', ({ answer } = {}) => {
        const room = rooms.get(socketRoom.get(socket.id));
        if (!room || room.state !== 'playing') return;
        const p = room.players.find(x => x.id === socket.id);
        if (p) cevapIsle(room, p, answer);
    });

    // ---------------- ODADAN AYRIL ----------------
    socket.on('room:leave', () => odadanAyril(socket));
    socket.on('disconnect', () => odadanAyril(socket));

    function odadanAyril(socket) {
        const kod = socketRoom.get(socket.id);
        socketRoom.delete(socket.id);
        if (!kod) return;
        const room = rooms.get(kod);
        if (!room) return;

        const cikan = room.players.find(p => p.id === socket.id);
        room.players = room.players.filter(p => p.id !== socket.id);

        if (!room.players.length) {
            timerleriTemizle(room);
            rooms.delete(kod);
            return;
        }
        // Kurucu çıktıysa en eski oyuncu kurucu olur
        if (!room.players.some(p => p.host)) {
            room.players[0].host = true;
            room.hostId = room.players[0].id;
        }
        // Oyun sürerken biri çıkarsa oyunu durdur, lobbiye dön
        if (room.state !== 'lobby' && room.state !== 'finished') {
            timerleriTemizle(room);
            room.state = 'lobby';
            room.qIndex = 0;
            room.sorular = [];
            room.players.forEach(p => {
                p.score = 0; p.correct = 0; p.wrong = 0;
                p.answered = null; p.sonCevap = null; p.sonCevapMetin = null;
            });
            io.to(kod).emit('toast', `${cikan ? cikan.name : 'Bir oyuncu'} ayrıldı — oyun iptal edildi, lobbiye dönüldü.`);
        } else {
            io.to(kod).emit('toast', `${cikan ? cikan.name : 'Bir oyuncu'} odadan ayrıldı.`);
        }
        broadcast(kod);
    }
});

// Boşta kalan odaları temizle (2 saat hareketsizse)
setInterval(() => {
    const simdi = Date.now();
    for (const [kod, room] of rooms.entries()) {
        if (simdi - room.sonAktivite > 2 * 60 * 60 * 1000) {
            timerleriTemizle(room);
            rooms.delete(kod);
        }
    }
}, 60 * 1000);

// ---------------------------------------------------------- KATEGORİ LİSTESİ
app.get('/api/kategoriler/:mod', (req, res) => {
    const mod = req.params.mod;
    const src = DATA[mod];
    if (!src) return res.json([]);
    res.json(Object.entries(src).map(([id, v]) => ({
        id,
        ad: mod === 'text' ? id : (v.name || id),
        icon: mod === 'text' ? '📁' : (v.icon || '🖼️'),
        adet: Array.isArray(v) ? v.length : (v.items ? v.items.length : 0)
    })));
});

app.get('/api/durum', (_req, res) => {
    res.json({
        aktifOda: rooms.size,
        sorular: {
            text: Object.keys(DATA.text).length,
            photo: Object.keys(DATA.photo).length,
            blur: Object.keys(DATA.blur).length,
            hizli: Object.keys(DATA.hizli).length
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log('===============================================');
    console.log('  MATEX Çok Oyunculu sunucu hazır');
    console.log('  Yerel:  http://localhost:' + PORT);
    console.log('  Modlar: ' + Object.keys(MODLAR).join(', '));
    console.log('===============================================');
});

// ============================================================================
// SADECE TEST İÇİN — test-e2e.js puanlamayı doğrulayabilsin diye doğru cevabı
// verir. Gerçek oyunda istemci bunu asla kullanmaz; prod'a alırken silebilirsin.
// ============================================================================
app.get('/api/test-coz/:kod/:i', (req, res) => {
    const room = rooms.get(String(req.params.kod).toUpperCase());
    const q = room && room.sorular[Number(req.params.i)];
    if (!q) return res.status(404).json({ error: 'yok' });
    res.json({ dogru: q.dogru, name: q.name, label: q.label, answers: q.answers, secenekler: q.secenekler });
});
