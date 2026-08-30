# MATEX Çok Oyunculu Sunucu

Sorular `server.js` dosyasının İÇİNE gömülü — ayrı bir soru dosyası yüklemen gerekmez.

## Render ayarları
| Alan | Değer |
|---|---|
| Runtime | **Node** |
| Build Command | `npm install` |
| Start Command | `node server.js` |
| Instance Type | **Free** |

## Yapı
```
server.js          ← sunucu + sorular (gömülü)
package.json
public/index.html  ← oyun sayfası
```

## Sağlık kontrolü
Tarayıcıda `https://SENİN-ADRESİN.onrender.com/api/durum` aç. Şunu görmelisin:
```json
{"aktifOda":0,"sorular":{"text":30,"photo":25,"blur":10,"hizli":5}}
```
Bu görünüyorsa sunucu çalışıyor demektir.

## Görseller
`public/` içinde resim yok — oyun bulamadığı görseli otomatik olarak
`https://matexquiz.vercel.app/` adresinden yükler.
