// Multilingual profanity & slur filter (TR, EN, AZ, DE, FR, ES, PT, IT, NL, PL, RU, AR)
// Handles leet-speak substitutions and diacritics while preserving clean words.

const BAD_WORDS_LATIN = [
  // Turkish & Azerbaijani
  'amk', 'aq', 'amq', 'amcik', 'amcuk', 'amina', 'aminakoyim', 'aminakoyayim', 'amini',
  'ananiskm', 'ananisikeyim', 'ananisikim', 'anasini', 'orospu', 'oruspu', 'oç', 'oc',
  'pic', 'piç', 'sik', 'sikim', 'sikeyim', 'sikerim', 'siktir', 'sikik', 'siktirgit',
  'yarrak', 'yarak', 'yarragi', 'tasak', 'tassak', 'göt', 'got', 'gotveren', 'götveren',
  'gotunu', 'ibne', 'ipne', 'puşt', 'pust', 'pezevenk', 'kahpe', 'kaltak', 'sürtük',
  'surtuk', 'fahise', 'fahişe', 'kevase', 'kevaşe', 'döl', 'yavsak', 'yavşak', 'itoglu',
  'sg', 'mk', 'sktr', 'aqm', 'qehbe', 'qehpe', 'gic', 'sikdir', 'cındır', 'cindir',
  // English
  'fuck', 'fucker', 'fucking', 'motherfucker', 'mf', 'shit', 'bullshit', 'bitch',
  'asshole', 'bastard', 'dick', 'cock', 'pussy', 'cunt', 'whore', 'slut', 'fag',
  'faggot', 'nigger', 'nigga', 'retard', 'wanker', 'twat', 'prick', 'cocksucker',
  'dipshit', 'dumbass', 'jackass', 'stfu', 'gtfo',
  // German
  'arschloch', 'scheisse', 'scheiße', 'hurensohn', 'fotze', 'schlampe', 'wichser',
  'ficken', 'fick', 'schwuchtel', 'missgeburt', 'hure', 'bastard', 'vollidiot',
  // French
  'putain', 'merde', 'connard', 'connasse', 'salope', 'encule', 'enculé', 'pute',
  'fdp', 'ntm', 'nique', 'batard', 'bâtard', 'couille', 'branleur', 'bordel',
  // Spanish & Portuguese
  'puta', 'puto', 'mierda', 'cabron', 'cabrón', 'pendejo', 'culero', 'chinga',
  'chingar', 'verga', 'coño', 'cono', 'maricon', 'maricón', 'gilipollas', 'joder',
  'caralho', 'porra', 'buceta', 'viado', 'arrombado', 'cuzao', 'cuzão', 'foda', 'foder',
  // Italian
  'cazzo', 'merda', 'stronzo', 'stronza', 'troia', 'puttana', 'vaffanculo', 'fanculo',
  'coglione', 'figlio di puttana', 'minchia', 'bastardo',
  // Dutch
  'kanker', 'tyfus', 'tering', 'klootzak', 'hoer', 'lul', 'kut', 'flikker', 'eikel',
  // Polish
  'kurwa', 'chuj', 'huj', 'pierdol', 'pierdole', 'pierdolić', 'jebac', 'jebać',
  'skurwysyn', 'pizda', 'cipa', 'dziwka', 'suka', 'debil',
  // Russian (translit)
  'blyat', 'blyad', 'suka', 'nahui', 'nahuy', 'pizdec', 'ebat', 'yebat', 'mudak',
  'gandon', 'pidor', 'pidoras', 'huylo', 'huy', 'khuy', 'shlyuha'
];

const BAD_WORDS_NON_LATIN = [
  // Russian Cyrillic
  'блядь', 'блять', 'сука', 'нахуй', 'хуй', 'пизда', 'пиздец', 'ебать', 'мудак',
  'гандон', 'пидор', 'пидорас', 'шлюха', 'ублюдок', 'долбоеб', 'долбоёб',
  // Arabic
  'كس', 'طيز', 'زبي', 'زب', 'شرموطة', 'شرموط', 'قحبة', 'منيك', 'عرص', 'خول', 'ابن الكلب', 'كلب'
];

function normalizeToken(token: string): string {
  return token
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/0/g, 'o')
    .replace(/1/g, 'i')
    .replace(/3/g, 'e')
    .replace(/4/g, 'a')
    .replace(/5/g, 's')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/[^a-z0-9]/g, '');
}

const LATIN_SET = new Set(BAD_WORDS_LATIN.map((w) => normalizeToken(w)).filter(Boolean));
const NON_LATIN_REGEX = new RegExp(
  BAD_WORDS_NON_LATIN.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'),
  'gi'
);

function isBadNormalized(norm: string): boolean {
  if (!norm) return false;
  if (LATIN_SET.has(norm)) return true;
  // Also collapse repeated letters (e.g. "fuuuuck" -> "fuck", "amkkk" -> "amk")
  const collapsed = norm.replace(/(.)\1+/g, '$1');
  if (LATIN_SET.has(collapsed)) return true;
  // Check longer profanity roots contained inside longer compound tokens (>=4 chars to avoid false positives)
  for (const bw of LATIN_SET) {
    if (bw.length >= 4 && (norm.includes(bw) || collapsed.includes(bw))) {
      return true;
    }
  }
  return false;
}

export function censorText(input: string): string {
  if (!input) return input;
  let out = input.replace(NON_LATIN_REGEX, (m) => '*'.repeat(Math.max(3, m.length)));
  // Censor whitespace-separated segments carefully without breaking punctuation
  out = out.replace(/[^\s]+/g, (segment) => {
    const norm = normalizeToken(segment);
    if (isBadNormalized(norm)) {
      return '*'.repeat(Math.min(8, Math.max(3, segment.length)));
    }
    return segment;
  });
  return out;
}
