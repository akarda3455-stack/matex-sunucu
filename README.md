# MATEX Çok Oyunculu Sunucu

## Render ayarları

| Alan | Değer |
|---|---|
| Runtime | **Node** |
| Build Command | `npm install` |
| Start Command | `node server.js` |
| Instance Type | **Free** |

Logda `MATEX Çok Oyunculu sunucu hazır` yazınca hazır.
Üstteki adres (örn. `https://matex.onrender.com`) oyun adresin.

## Klasör yapısı (böyle kalmalı)

```
server.js            ← sunucu
package.json
data/sorular.json    ← sorular (doğru cevaplar burada, tarayıcıya gitmez)
public/index.html    ← oyun sayfası
```

## Görseller

`public/` içinde resim yok — oyun bir görseli bulamazsa otomatik olarak
`https://matexquiz.vercel.app/` adresinden yükler. Yani resimleri buraya
yüklemek zorunda değilsin. (Yüklersen daha hızlı olur.)
