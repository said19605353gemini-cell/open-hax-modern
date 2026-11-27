# ⚽ OpenHaxModern

[![Live Demo](https://img.shields.io/badge/Play%20Now-GitHub%20Pages-2ea44f?style=for-the-badge&logo=github)](https://said19605353gemini-cell.github.io/open-hax-modern/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178c6?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.0-646cff?style=for-the-badge&logo=vite)](https://vitejs.dev/)
[![WebRTC](https://img.shields.io/badge/P2P-PeerJS%20WebRTC-orange?style=for-the-badge)](https://peerjs.com/)
[![Built with Gemini Antigravity](https://img.shields.io/badge/Built%20with-Gemini%20Antigravity-8E75B2?style=for-the-badge&logo=googlegemini)](https://deepmind.google/)

> [🇹🇷 Türkçe Açıklama](#-türkçe) · [🇬🇧 English Description](#-english)  
> ✨ **Google Gemini Antigravity** ile geliştirilmiştir / Built with **Google Gemini Antigravity**.  
> 🔗 Temel Kaynak / Based on: **[erasmo-marin/open-hax](https://github.com/erasmo-marin/open-hax)** (üzerine modern özellikler geliştirilmiştir).

## 🎮 Play Online / Canlı Oyna
- 🔥 **Firebase Hosting:** **https://haxturko53.web.app**
- 🐙 **GitHub Pages:** **https://said19605353gemini-cell.github.io/open-hax-modern/**

---

## 🇹🇷 Türkçe

Modern, tarayıcı tabanlı çok oyunculu 2D futbol (**HaxBall** tarzı) oyunu. **[erasmo-marin/open-hax](https://github.com/erasmo-marin/open-hax)** açık kaynak projesi temel alınarak **Google Gemini Antigravity** ile geliştirilmiştir.  
Hem doğrudan **GitHub Pages** üzerinde Firebase desteğiyle, hem de **PHP web hosting** üzerinde sunucu oda listesiyle çalışır.

### ✨ Öne Çıkan Özellikler
- **📱 Tam Mobil Desteği & Dokunmatik Kontroller (YENİ):**
  - Akıllı telefon ve tabletlerde otomatik açılan yarı saydam **Sanal Joystick** ve **ŞUT** butonu (aynı anda hareket + şut için çoklu dokunma / multi-touch).
  - Mobil ekranlar ve yönler (dikey/yatay) için tam responsive arayüz (üst menü, lobi, sohbet ve ayarlar otomatik ölçeklenir).
  - Tek dokunuşla çalışan **⛶ Tam Ekran** (F11 modu), **👁️ Odak Modu** (üst menü ve sohbeti gizleyip sahayı ekrana yayma), **☰ Menü** ve **💬 Chat** açıp-kapama butonları.
- **⚡ VSync Kilitsiz Yüksek Hızlı Oyun Motoru & Ortak FPS:**
  - Tarayıcının 60Hz VSync sınırlamasına bağlı kalmadan `MessageChannel` ve yüksek hassasiyetli zamanlayıcı ile çalışan oyun döngüsü.
  - Odaya giren herkes için ortak **Oda FPS Sınırı** (`60`, `75`, `100`, `120`, `144`, `240 FPS` veya `Sınırsız`) — fizik motoru tick hızı ile ekran tazelemesi kusursuz senkronize olur, dalgalanma yapmaz.
- **36 Dil & 195+ Ülke SVG Bayrak Desteği:** Tarayıcı dilini/ülkesini otomatik algılar; tüm arayüzde `flag-icons` ile yüksek çözünürlüklü vektörel SVG bayraklar ve arama özellikli dil/ülke seçicileri sunar.
- **Canlı Genel Sohbet & Liderlik Tablosu:** Giriş ekranında ve lobi (odalar/sunucular) ekranının sol tarafında anlık **Genel Sohbet**, **⚽ Gol Kralları**, **⏱️ En Çok Süre Geçirenler** ve süre rozetleri yer alır.
- **Özel Güç Modları (Power-Ups):** Oda kurarken veya maç içinde seçilebilir/kapatılabilir modlar: 🦅 Şahin Vuruşu, 🔥 Alevli Şut, ⚡ Hızlı Koşu (Turbo), 🧲 Mıknatıs, 🛡️ Dev Oyuncu, 🌟 Hepsi.
- **Gelişmiş Oda & Admin Yönetimi (`ESC`):**
  - Sürükle-bırak veya sağ tık ile oyuncuları/botları Kırmızı, Mavi, İzleyici veya Odadan At alanına taşıma.
  - Oda giriş kilitleme (`🚪 Oda Giriş: Açık/Kilitli`), Takım kilitleme, Kırmızı/Mavi bot ekleme/silme, Bot zorluğu (`Kolay / Orta / Zor`).
  - **Otomatik Host Migration:** Kurucu ayrılırsa oda sıradaki gerçek oyuncuya devredilir.
  - **Tıklanabilir Duraklatma (`P`) Menüsü:** `▶ Devam Et (P)`, `🔄 Sıfırla (R)`, `⚙️ Ayarlar`, `🚪 Odadan Çık`.
  - **Sayfa Yenilemede (`F5`) Kaldığı Yerden Devam:** Lobi veya maç içindeyken `F5` atıldığında ekran, oda ayarları, skor, süre, top ve oyuncu/bot konumları korunur.
- **VSync'siz Yüksek FPS & Görünüm Ölçeği:**
  - VSync kilidinden bağımsız hassas zamanlayıcı; kişisel FPS limiti (varsayılan `60 FPS`, `30–500 FPS` veya `Sınırsız`) ve maç sırasında değiştirilebilen **Oda FPS Limiti**.
  - `Dinamik`, `Sabit`, `Tam Ekran (Geniş)` ve `Tam Ekran (F11 / Gerçek)` modları ile `%75–%300` görsel & çözünürlük ölçeği.
- **Maç Videosu Kaydı & Otomatik YouTube Yayını:**
  - Oyun içi `⏺ Kaydet` / `⏸ Duraklat` / `⏹ Bitir & Yayınla` butonları ve `YT: Açık / Liste Dışı / Gizli` seçicisi ile kaydedilen `.webm` maç videosunu doğrudan oyuncunun kendi YouTube hesabına otomatik yükleme (Google OAuth + YouTube Data API v3).
- **16 Fizik Profili, 17+ Saha & Özel `.hbs` Haritalar:**
  - Klasik (`open-hax`), Klasik HaxBall `v1/v2`, Pro Kontrol `v1/v2/v3`, Futsal, Turbo `v1/v2`, Gerçekçi Futbol `v1/v2`, Buz Hokeyi, Pinball, Ağır Tank + 17 hazır saha + `.hbs` / `.hbys` harita yükleme ve indirme.
- **Gelişmiş Görsel Özelleştirme (Video Sekmesi):**
  - 8 farklı dönen top görünümü (`Futbol`, `Klasik`, `Şampiyonlar Ligi`, `Alev`, `Neon`, `Altın`, `Plaj`, `Tenis`) ve topa göre renklenen iz efekti.
  - Ayrı ayrı seçilebilen **Kale Ağı Stili** (`Klasik`, `Elmas`, `Takım Renkli`, `Neon`, `Altın`) ve **Kale Direği Stili** (`Pastel`, `Beyaz`, `Takım Renkli`, `Neon`, `Altın`, `Karbon`).
  - Hareketli **Stadyum Tribünü & Taraftarlar** ve 6 farklı saha dokusu.
- **🛡️ Güvenli Mod & Firebase Kuralları:**
  - `e.isTrusted` sahte girdi/makro engeli, canlı ortamda `F12`/sağ tık koruması, Speedhack saat kontrolü, Host hız doğrulaması ve `database.rules.json` ile sunucu taraflı Firebase RTDB doğrulamaları.
  - **AutoHotkey / Donanım Makrosu Notu:** Tarayıcı güvenlik modeli gereği işletim sistemi düzeyinde çalışan AutoHotkey gibi araçlar doğrudan engellenemez; ancak oyun içinde `P` (Duraklat) tuşuna basıldığında sohbet odaklı makro testi ile seri tuş basımları tespit edilebilir.

### 🕹️ Kontroller
| Tuş | İşlev |
| --- | --- |
| `W A S D` / `Ok Tuşları` | Hareket |
| `Space` / `X` | Şut (Kick) |
| `P` | Duraklat / Devam Et (Admin) |
| `R` | Maçı Sıfırla (Admin) |
| `ESC` | Oda & Takım Menüsü |
| `Enter` / `Tab` | Sohbet Odakla |

---

## 🇬🇧 English

**OpenHaxModern** is a modern, browser-based multiplayer 2D physics soccer game (**HaxBall-inspired**), built on top of **[erasmo-marin/open-hax](https://github.com/erasmo-marin/open-hax)** with **Google Gemini Antigravity**, TypeScript, HTML5 Canvas, PeerJS (WebRTC P2P), and Firebase / PHP room directory support.

### ✨ Key Features
- **36 Languages & 195+ Country SVG Flags:** Auto-detects browser language and country on first visit, with searchable dropdowns and crisp vector SVG flags (`flag-icons`) across leaderboards, chat, rooms, and player rosters.
- **Live Global Chat & Leaderboards:** Real-time Global Chat, Top Scorers, and Most Active Players tables visible on both the welcome screen and the lobby browser.
- **Power-Up Game Modes:** Toggleable match modifiers including 🦅 Hawk Shot, 🔥 Fire Shot, ⚡ Turbo Speed, 🧲 Magnet, 🛡️ Giant Player, or 🌟 All Power-Ups.
- **Room & Admin Controls (`ESC`):**
  - Drag-and-drop or right-click players/bots between Red, Blue, Spectators, or Kick.
  - Room entry lock, team lock, Red/Blue AI bots with adjustable difficulty (`Easy / Medium / Hard`), and automatic **Host Migration**.
  - Clickable **Pause (`P`) Menu** (`Resume`, `Reset`, `Settings`, `Leave Room`).
  - **Seamless `F5` Reload Persistence:** Preserves active screen, room settings, score, match timer, ball, and player/bot positions across page reloads.
- **Uncapped VSync-Free FPS & Visual Scaling:**
  - High-precision `MessageChannel` loop free of 60Hz VSync lock; personal FPS limit (default `60 FPS`, `30–500 FPS`, or `Unlimited`) plus an in-room **Room FPS Limit** enforced for all players.
  - Viewport modes (`Dynamic`, `Restricted`, `Full Width`, `True Fullscreen`) and `75%–300%` visual & resolution scaling.
- **In-Game Recording & Automatic YouTube Upload:**
  - Record, pause/resume, and stop match videos directly from the top bar and automatically publish them to your own YouTube channel (`Public`, `Unlisted`, or `Private`) via Google OAuth & YouTube Data API v3.
- **16 Physics Profiles, 17 Stadiums & Global Profanity Filter:**
  - Includes Classic, Pro Control, Futsal, Turbo, Real Soccer, Ice Hockey, Pinball, Heavy Tank physics profiles, 17 arenas (including `.hbs` maps), and multilingual profanity/XSS filtering across 36+ languages.

### 🕹️ Controls
| Key | Action |
| --- | --- |
| `W A S D` / `Arrow Keys` | Move |
| `Space` / `X` | Kick |
| `P` | Pause / Resume (Admin) |
| `R` | Reset Match (Admin) |
| `ESC` | Room & Team Menu |
| `Enter` / `Tab` | Focus Chat |

---

## 🛠️ Local Development / Yerel Geliştirme

```bash
npm install
npm run dev     # Start local dev server
npm run build   # Type-check & production build (dist/)
```
