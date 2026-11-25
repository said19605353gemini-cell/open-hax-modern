export type Lang = 'tr' | 'en';

export const TRANSLATIONS: Record<Lang, Record<string, string>> = {
  tr: {
    authTitle: "OpenHax'e Hoş Geldin",
    authSub: 'Sahaya çıkmadan önce oyuncu adını ve avatarını belirle.',
    nickLabel: 'Kullanıcı Adı',
    avatarLabel: 'Avatar (Kısa Simge)',
    enterLobby: 'Lobiye Gir',
    enterInvite: 'Adını Oluştur ve Odaya Katıl',
    roomsTitle: 'Odalar / Sunucular',
    createRoomTitle: 'Yeni Oda Oluştur',
    createRoomBtn: 'Oda Oluştur ve Oyuna Gir',
    joinBtn: 'Katıl',
    refreshBtn: 'Yenile',
    changeName: 'Ad Değiştir',
    pause: 'Duraklat (P)',
    resume: 'Devam Et (P)',
    reset: 'Sıfırla (R)',
    leaveRoom: 'Odadan Çık',
    copyLink: 'Davet Linki Kopyala',
    copied: 'Kopyalandı!',
    settingsTitle: 'Performans ve Oyun Ayarları',
    close: 'Kapat',
    send: 'Gönder',
    goalRed: 'GOL! KIRMIZI TAKIM!',
    goalBlue: 'GOL! MAVİ TAKIM!',
    pausedBanner: 'OYUN DURAKLATILDI (P)',
    soundOn: 'Ses: Açık',
    soundOff: 'Ses: Kapalı'
  },
  en: {
    authTitle: 'Welcome to OpenHax',
    authSub: 'Choose your player name and avatar before entering the pitch.',
    nickLabel: 'Username',
    avatarLabel: 'Avatar (Short Tag)',
    enterLobby: 'Enter Lobby',
    enterInvite: 'Create Name & Join Room',
    roomsTitle: 'Rooms / Servers',
    createRoomTitle: 'Create New Room',
    createRoomBtn: 'Create Room & Play',
    joinBtn: 'Join',
    refreshBtn: 'Refresh',
    changeName: 'Change Name',
    pause: 'Pause (P)',
    resume: 'Resume (P)',
    reset: 'Reset (R)',
    leaveRoom: 'Leave Room',
    copyLink: 'Copy Invite Link',
    copied: 'Copied!',
    settingsTitle: 'Performance & Game Settings',
    close: 'Close',
    send: 'Send',
    goalRed: 'GOAL! RED TEAM!',
    goalBlue: 'GOAL! BLUE TEAM!',
    pausedBanner: 'GAME PAUSED (P)',
    soundOn: 'Sound: On',
    soundOff: 'Sound: Off'
  }
};

export function t(lang: Lang, key: string): string {
  return (TRANSLATIONS[lang] && TRANSLATIONS[lang][key]) || TRANSLATIONS.tr[key] || key;
}
