# GitHub'a yükleme + Render kurulumu (adım adım)

Bu klasörde **sadece sunucunun çalışması için gereken 4 şey** var:

```
server.js            ← sunucu programı
package.json         ← hangi paketler gerekli (express, socket.io)
data/sorular.json    ← 1184 soru + görsel listesi (doğru cevaplar burada)
public/index.html    ← oyun sayfası (çok oyunculu eklenmiş hâli)
```

Yanında 2 yardımcı dosya daha var: `README.md` (bilgi) ve `render.yaml`
(Render ayarlarını otomatik doldurur — olması şart değil ama kolaylık).

> ⚠️ `node_modules` klasörünü **YÜKLEME**. Onu Render kendi oluşturur.
> ⚠️ Resimleri de yüklemek **zorunda değilsin** — oyun bulamadığı görseli
> otomatik olarak `matexquiz.vercel.app` adresinden çeker.

---

## 1) GitHub'da yeni depo aç

1. https://github.com → sağ üstteki **+** → **New repository**
2. **Repository name:** `matex-sunucu`
3. **Public** seç
4. **Create repository**

> Mevcut `matexquiz` depona **dokunma**, o tek oyunculu site olarak kalsın.

## 2) Dosyaları yükle

1. Açılan sayfada ortadaki mavi yazı: **"uploading an existing file"** → tıkla
   (görmezsen: `github.com/KULLANICI/matex-sunucu/upload`)
2. Bu klasördeki **her şeyi** sürükle-bırak:
   - `server.js`
   - `package.json`
   - `README.md`
   - `render.yaml`
   - **`data` klasörü** (içinde `sorular.json`)
   - **`public` klasörü** (içinde `index.html`)
3. Sayfanın altına in → yeşil **Commit changes** butonuna bas

### Yüklemeden sonra kontrol et

Depo sayfasında şunu görmelisin:

```
data/                 ← klasör (içine tıklayınca sorular.json görünmeli)
public/               ← klasör (içine tıklayınca index.html görünmeli)
README.md
package.json
render.yaml
server.js
```

**Önemli:** `sorular.json` doğrudan kökte değil, `data/` klasörünün **içinde** olmalı.
`index.html` de `public/` klasörünün **içinde** olmalı.
Düz dururlarsa sunucu dosyayı bulamaz. Yanlış olduysa: dosyaya tıkla →
kalem simgesi (Edit) → en üstteki yolda `data/` yaz → **Commit changes**.

### ❓ GitHub'da başka bir şey yapman gerekiyor mu?

**Hayır.** GitHub tarafında ayar yok — ne branch, ne secret, ne de başka bir şey.
Depo sadece dosyaların durduğu yer. Geri kalan her şey Render'da.

---

## 3) Render'da sunucuyu başlat

1. https://render.com → **Get Started for Free** → **"GitHub"** ile kaydol
2. Üstteki **New +** → **Web Service**
3. **Connect a repository from GitHub** → listeden `matex-sunucu` → **Connect**
4. Ayarlar (`render.yaml` varsa çoğu otomatik dolar, yine de kontrol et):

   | Alan | Değer |
   |---|---|
   | Name | `matex` |
   | Region | **Frankfurt** |
   | Runtime | **Node** |
   | Build Command | `npm install` |
   | Start Command | `node server.js` |
   | Instance Type | **Free** |

5. **Create Web Service**
6. 1-2 dakika bekle. **Logs** sekmesinde şunu arayın:

   ```
   ℹ️  public/ içinde 0 görsel var — eksik görsel filtresi KAPALI.
      Görseller gerektiğinde https://matexquiz.vercel.app adresinden yüklenecek.
   ===============================================
     MATEX Çok Oyunculu sunucu hazır
   ===============================================
   ```

7. Sayfanın üstündeki adres senin oyun adresin:
   **`https://matex.onrender.com`** gibi bir şey olacak.

## 4) Oyna

- Sen ve arkadaşın **ikiniz de o adrese** girin
- Profillerde adınızı yazın → **Devam Et** → **🤝 Arkadaşınla Oyna**
- Biri **Oda Kur**, kodu diğerine gönder
- Diğeri **Kodla Katıl** → kodu gir
- Kurucu mod/kategori/soru sayısı/süre seçer → **🚀 Oyunu Başlat**

---

## Sorun çıkarsa

| Belirti | Çözüm |
|---|---|
| Render'da "Build failed" | `package.json` kökte değil. Depoda `package.json` ana sayfada görünmeli. |
| Log "Cannot find module ./data/sorular.json" | `sorular.json` kökte kalmış → `data/` klasörünün içine taşı |
| Sayfa açılıyor ama "Sunucuya bağlanılamadı" | Render'da servis **Live** değil; Logs'a bak, hata satırını bana gönder |
| Oyun açılıyor ama görseller gelmiyor | `matexquiz.vercel.app` erişilemiyor olabilir; o zaman resimleri `public/` içine yükle |
| İlk açılış 30 saniye sürüyor | Ücretsiz plan uyumuş — normal, bekle |
| 15 dk sonra bağlantı kopuyor | Ücretsiz plan uykuya geçer — sayfayı yenile |

**Log çıktısını olduğu gibi bana at, bakarım.**
