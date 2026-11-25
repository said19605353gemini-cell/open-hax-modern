# OpenHaxModern

Modern, tarayıcı tabanlı çok oyunculu 2D futbol (**HaxBall** tarzı) oyunu. Hem doğrudan **GitHub Pages** üzerinde Firebase desteğiyle, hem de **PHP web hosting** üzerinde sunucu oda listesiyle çalışır.

## Canlı Oyna
👉 **https://said19605353gemini-cell.github.io/open-hax-modern/**

---

## Özellikler

### Çok Oyunculu & Oda Sistemi
- **Otomatik Lobi & Oda Listesi**: GitHub Pages üzerinde Firebase Realtime Database, özel sunucularda ise `api/rooms.php` ile canlı oda listesi, şifreli/özel odalar ve davet linki (`?room=KOD`) ile katılım.
- **Ülke Bayrakları & Ping Göstergesi**: 50+ ülke bayrağı desteği, lobi listesinde tahmini ping ve oda içinde oyunculara göre canlı WebRTC ping göstergesi.
- **Otomatik Oda Sahipliği Devri (Host Migration)**: Kurucu odadan ayrılırsa oda sahipliği otomatik olarak sıradaki gerçek oyuncuya (botlara değil) devredilir; odada kimse kalmazsa oda otomatik kapanır.
- **HaxBall Tarzı Tam Ekran Saha & `ESC` Oda Menüsü**: Çapraz çim desenli saha, yuvarlatılmış kale ağları, alt ortada yüzen yarı saydam sohbet ve `ESC` ile açılan 3 sütunlu **Kırmızı / İzleyiciler / Mavi** takım menüsü (`Auto`, `Rand`, `Kilitle`, `Reset`, `+ Bot`).

### Üyelik & Oyuncu Profili / İstatistik Sistemi
- İsteğe bağlı hesap şifresi ile kalıcı **Üyelik Profili** (Firebase + yerel senkronizasyon).
- **Otomatik Takip Edilen İstatistikler**: Gol, Kurtarma (Save), Asist, Maç Sayısı, Galibiyet, **En Çok Oynadığı Fizik Modu**, **En Çok Oynadığı Harita** ve canlı **🏆 Liderlik Tablosu**.

### Oda Yöneticisi (Admin) & Kullanıcı Ayar Ayrımı
- Üst oyuncu şeridinde veya takım listesinde sağ tık ile **★ Admin Yap / Adminliği Al**, **Takım Değiştir** ve **Odadan At**.
- Fizik profili, top kontrolü, saha seçimi, bot kontrolü ve takım kilidi yalnızca adminler tarafından yönetilir; grafik, FPS, ses ve chat ayarları her oyuncu için kişiseldir.

### Fizik Profilleri (16 Seçenek) & Sahalar (17 Harita)
- **Fizik Motorları (`v1 / v2 / v3`)**: OpenHax Orijinal (60Hz), Klasik Haxball `v1/v2`, Pro Kontrol `v1/v2/v3`, Futsal, Büyük Saha, Turbo `v1/v2`, Düşük Sürtünme, Gerçekçi Futbol `v1/v2`, Buz Hokeyi, Pinball, Ağır Tank ve özel sürgü ayarları.
- **Sahalar**: Classic, Big, Huge, Futsal, Tiny, Long, 3v3 Orta Arena, Hızlı 2v2, Geniş Kanat, Ceza Sahası + 7 orijinal `.hbs` haritası (*Classic, Easy, Small, Rounded, Big, Big Easy, Huge*).

### Grafik, Performans, Dil & Güvenlik
- **Sekmeli HaxBall Ayarlar Menüsü**: `Ses`, `Video`, `Girdi`, `Çeşitli`, `Fizik (Admin)` sekmeleri; sınırsız FPS ve `30 / 60 / 75 / 120 / 144 / 240 / 500` FPS limitleri, Viewport modu, düşük gecikmeli canvas, avatar gizleme, chat saydamlık/yükseklik/genişlik ve `.gif` gol/gol yeme/tezahürat animasyonları.
- **12 Dil Desteği**: Türkçe, English, Azərbaycan, Deutsch, Français, Español, Português, Italiano, Nederlands, Polski, Русский, العربية.
- **Çok Dilli Küfür Filtresi & Güvenlik**: 12+ dilde küfür sansürü, XSS koruması ve P2P paket kimlik doğrulaması.

---

## Yerel Geliştirme & Build
```bash
npm install
npm run dev     # Yerel geliştirme sunucusu
npm run build   # Production build (dist/)
```
