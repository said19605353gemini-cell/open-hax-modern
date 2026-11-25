# ⚽ OpenHaxModern

[![Live Demo](https://img.shields.io/badge/Canlı%20Oyna-GitHub%20Pages-2ea44f?style=for-the-badge&logo=github)](https://said19605353gemini-cell.github.io/open-hax-modern/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646cff?style=for-the-badge&logo=vite)](https://vitejs.dev/)
[![WebRTC](https://img.shields.io/badge/P2P-PeerJS%20WebRTC-orange?style=for-the-badge)](https://peerjs.com/)

Modern, tarayıcı tabanlı çok oyunculu 2D futbol (**HaxBall** tarzı) oyunu.  
Hem doğrudan **GitHub Pages** üzerinde Firebase desteğiyle, hem de **PHP web hosting** üzerinde sunucu oda listesiyle çalışır.

## 🎮 Hemen Oyna
👉 **https://said19605353gemini-cell.github.io/open-hax-modern/**

---

## ✨ Öne Çıkan Özellikler

### 🌍 36 Dil & 195+ Ülke SVG Bayrak Desteği
- **36 Dünya Dili (`i18n`):** Türkçe, English, Azərbaycan, Deutsch, Français, Español, Português, Italiano, Nederlands, Polski, Русский, العربية, Українська, Română, Ελληνικά, Čeština, Magyar, Svenska, Norsk, Dansk, Suomi, Български, Српски, Hrvatski, ქართული, Қазақша, Oʻzbekcha, فارسی, עברית, हिन्दी, Bahasa Indonesia, Tiếng Việt, ไทย, 日本語, 한국어, 中文.
- **Otomatik Dil & Ülke Algılama:** Tarayıcı diline ve saat dilimine göre varsayılan dil/ülke otomatik seçilir; yapılan son ayarlar kaydedilir.
- **Gerçek SVG Bayrak Logoları (`flag-icons`):** Tüm tarayıcılarda (`TR`, `FR` vb. metin yerine) yüksek çözünürlüklü vektörel bayrak ikonları, arama özellikli dil & ülke menüsü.

### ⚡ Özel Güçler (Power-Ups) & Oyun Modları
- **Özel Güç Modları:** Oda kurarken veya maç içinde seçilebilir/kapatılabilir modlar:
  - 🦅 **Şahin Vuruşu**
  - 🔥 **Alevli Şut**
  - ⚡ **Hızlı Koşu (Turbo)**
  - 🧲 **Mıknatıs (Top Çekimi)**
  - 🛡️ **Dev Oyuncu**
  - 🌟 **Tüm Özel Güçler**

### 🌐 Çok Oyunculu Lobi, Genel Sohbet & Oda Yönetimi
- **Canlı Genel Sohbet & Liderlik Tablosu:** Giriş ekranında ve lobi (odalar/sunucular) ekranının sol tarafında anlık **Genel Sohbet**, **⚽ Gol Kralları**, **⏱️ En Çok Süre Geçirenler** ve süre rozetleri.
- **Canlı Oda Listesi & Otomatik Yenileme:** Firebase Realtime Database veya `api/rooms.php` üzerinden `5 / 10 / 15 sn` otomatik yenileme, şifreli/özel odalar ve davet linki (`?room=KOD`).
- **Sürükle-Bırak Takım Yönetimi (`ESC`):** Adminler oyuncuları ve botları sürükle-bırak veya sağ tık ile **Kırmızı**, **Mavi**, **İzleyici** veya **Odadan At** alanına taşıyabilir; oda girişini kilitleyebilir (`🚪 Oda Giriş: Açık/Kilitli`), kırmızı/mavi bot ekleyip silebilir ve bot zorluğunu (`Kolay / Orta / Zor`) seçebilir.
- **Otomatik Oda Sahipliği Devri (Host Migration):** Kurucu ayrılırsa oda sıradaki gerçek oyuncuya devredilir.
- **Sayfa Yenilemede (`F5`) Kaldığı Yerden Devam:** Lobi veya maç içindeyken `F5` atıldığında ekran, oda ayarları, skor, süre, top ve oyuncu/bot konumları korunarak oyun kaldığı yerden devam eder.

### 🚀 VSync'siz Yüksek FPS, Ölçek & Video Kaydı
- **VSync'siz Hassas Zamanlayıcı:** Ekran yenileme hızı (60 Hz) kilidine takılmadan kişisel FPS limiti (`60 FPS` varsayılan, `30–500 FPS` veya `Sınırsız`) ve **Oda FPS Limiti** (maç sırasında bile admin tarafından değiştirilebilir).
- **Görünüm Modları & Ölçek:** `Dinamik`, `Sabit`, `Tam Ekran (Geniş)`, `Tam Ekran (F11 / Gerçek)` modları ve `%75` – `%300` arası anlık görsel + çözünürlük ölçeği.
- **Tıklanabilir Duraklatma (`P`) Menüsü:** `▶ Devam Et (P)`, `🔄 Sıfırla (R)`, `⚙️ Ayarlar`, `🚪 Odadan Çık`.
- **Maç Videosu Kaydı:** Oyun içi `⏺ Kayıt` butonu ile maç videosu kaydedip indirme / YouTube paylaşım desteği.

### ⚙️ 16 Fizik Profili, 17 Saha & Küresel Küfür Filtresi
- **16 Fizik Profili:** OpenHax Orijinal, Klasik HaxBall `v1/v2`, Pro Kontrol `v1/v2/v3`, Futsal, Büyük Saha, Turbo `v1/v2`, Düşük Sürtünme, Gerçekçi Futbol `v1/v2`, Buz Hokeyi, Pinball, Ağır Tank.
- **17 Harita:** Classic, Big, Huge, Futsal, Tiny, Long, 3v3 Orta Arena, Hızlı 2v2, Geniş Kanat, Ceza Sahası + 7 `.hbs` haritası.
- **Küresel Küfür & XSS Koruması:** 36+ dil ve alfabede (Latin, Kiril, Arapça, Farsça, Yunanca, Gürcüce, İbranice, Hintçe, CJK vb.) küfür filtresi, oda adı/nick/sohbet sansürü.

---

## 🕹️ Kontroller

| Tuş | İşlev |
| --- | --- |
| `W A S D` veya `Ok Tuşları` | Hareket |
| `Space` / `X` | Şut (Kick) |
| `P` | Duraklat / Devam Et (Admin) |
| `R` | Maçı Sıfırla (Admin) |
| `ESC` | Oda & Takım Listesi |
| `Enter` / `Tab` | Sohbet Odakla |

---

## 🛠️ Yerel Geliştirme & Build

```bash
npm install
npm run dev     # Yerel geliştirme sunucusu
npm run build   # TypeScript kontrolü ve production build (dist/)
```
