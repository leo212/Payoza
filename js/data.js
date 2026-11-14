// Static catalog: categories, currencies, avatar colors.

export const CATS = [
  { id: 'flight', name: 'טיסות', icon: 'plane', hue: 205 },
  { id: 'stay', name: 'לינה', icon: 'bed-double', hue: 262 },
  { id: 'food', name: 'מסעדות', icon: 'utensils', hue: 14 },
  { id: 'coffee', name: 'קפה ומאפה', icon: 'coffee', hue: 28 },
  { id: 'bar', name: 'בר ומשקאות', icon: 'beer', hue: 42 },
  { id: 'wine', name: 'יין ויקבים', icon: 'wine', hue: 340 },
  { id: 'market', name: 'סופר', icon: 'shopping-basket', hue: 96 },
  { id: 'train', name: 'רכבת ואוטובוס', icon: 'train-front', hue: 188 },
  { id: 'taxi', name: 'מונית', icon: 'car-taxi-front', hue: 50 },
  { id: 'car', name: 'רכב שכור', icon: 'car', hue: 222 },
  { id: 'fuel', name: 'דלק', icon: 'fuel', hue: 0 },
  { id: 'parking', name: 'חניה ואגרות', icon: 'circle-parking', hue: 232 },
  { id: 'boat', name: 'שיט ומעבורת', icon: 'ship', hue: 196 },
  { id: 'fun', name: 'אטרקציות', icon: 'ferris-wheel', hue: 318 },
  { id: 'culture', name: 'מוזיאונים', icon: 'landmark', hue: 34 },
  { id: 'nature', name: 'טבע וטרקים', icon: 'mountain', hue: 150 },
  { id: 'camp', name: 'קמפינג', icon: 'tent', hue: 126 },
  { id: 'beach', name: 'חוף וים', icon: 'tree-palm', hue: 168 },
  { id: 'snow', name: 'סקי ושלג', icon: 'snowflake', hue: 200 },
  { id: 'tickets', name: 'כרטיסים והופעות', icon: 'ticket', hue: 290 },
  { id: 'shop', name: 'קניות', icon: 'shopping-bag', hue: 330 },
  { id: 'gift', name: 'מתנות ומזכרות', icon: 'gift', hue: 352 },
  { id: 'health', name: 'בריאות', icon: 'pill', hue: 160 },
  { id: 'insure', name: 'ביטוח', icon: 'shield-check', hue: 214 },
  { id: 'sim', name: 'סים ותקשורת', icon: 'smartphone', hue: 250 },
  { id: 'laundry', name: 'כביסה', icon: 'washing-machine', hue: 180 },
  { id: 'tip', name: 'טיפים', icon: 'hand-coins', hue: 44 },
  { id: 'fees', name: 'עמלות ומזומן', icon: 'banknote', hue: 140 },
  { id: 'other', name: 'אחר', icon: 'ellipsis', hue: 225 },
];
export const CAT = Object.fromEntries(CATS.map(c => [c.id, c]));

// [code, symbol, Hebrew name, flag, approx units per 1 USD (fallback only)]
const C = [
  ['ILS', '₪', 'שקל', '🇮🇱', 3.6], ['USD', '$', 'דולר', '🇺🇸', 1], ['EUR', '€', 'אירו', '🇪🇺', 0.92],
  ['GBP', '£', 'ליש"ט', '🇬🇧', 0.78], ['THB', '฿', 'באט תאילנדי', '🇹🇭', 34], ['JPY', '¥', 'ין יפני', '🇯🇵', 150],
  ['CHF', 'CHF', 'פרנק שוויצרי', '🇨🇭', 0.88], ['AED', 'AED', 'דירהם', '🇦🇪', 3.67], ['TRY', '₺', 'לירה טורקית', '🇹🇷', 38],
  ['GEL', '₾', 'לארי גאורגי', '🇬🇪', 2.7], ['HUF', 'Ft', 'פורינט', '🇭🇺', 360], ['CZK', 'Kč', 'קורונה צ׳כית', '🇨🇿', 23],
  ['PLN', 'zł', 'זלוטי', '🇵🇱', 3.9], ['RON', 'lei', 'ליי רומני', '🇷🇴', 4.6], ['BGN', 'лв', 'לב בולגרי', '🇧🇬', 1.8],
  ['SEK', 'kr', 'כתר שוודי', '🇸🇪', 10.5], ['NOK', 'kr', 'כתר נורווגי', '🇳🇴', 10.7], ['DKK', 'kr', 'כתר דני', '🇩🇰', 6.9],
  ['ISK', 'kr', 'כתר איסלנדי', '🇮🇸', 138], ['CAD', 'C$', 'דולר קנדי', '🇨🇦', 1.38], ['AUD', 'A$', 'דולר אוסטרלי', '🇦🇺', 1.52],
  ['NZD', 'NZ$', 'דולר ניו זילנדי', '🇳🇿', 1.68], ['MXN', 'MX$', 'פסו מקסיקני', '🇲🇽', 18.5], ['BRL', 'R$', 'ריאל ברזילאי', '🇧🇷', 5.5],
  ['ARS', 'AR$', 'פסו ארגנטינאי', '🇦🇷', 1100], ['COP', 'CO$', 'פסו קולומביאני', '🇨🇴', 4100], ['PEN', 'S/', 'סול פרואני', '🇵🇪', 3.7],
  ['CLP', 'CL$', 'פסו צ׳יליאני', '🇨🇱', 950], ['INR', '₹', 'רופי הודי', '🇮🇳', 85], ['LKR', 'Rs', 'רופי סרי לנקי', '🇱🇰', 300],
  ['VND', '₫', 'דונג וייטנאמי', '🇻🇳', 25500], ['PHP', '₱', 'פסו פיליפיני', '🇵🇭', 57], ['IDR', 'Rp', 'רופיה', '🇮🇩', 16000],
  ['SGD', 'S$', 'דולר סינגפורי', '🇸🇬', 1.33], ['HKD', 'HK$', 'דולר הונג קונגי', '🇭🇰', 7.8], ['CNY', 'CN¥', 'יואן', '🇨🇳', 7.2],
  ['KRW', '₩', 'וון קוריאני', '🇰🇷', 1380], ['ZAR', 'R', 'ראנד', '🇿🇦', 18], ['EGP', 'E£', 'לירה מצרית', '🇪🇬', 49],
  ['JOD', 'JD', 'דינר ירדני', '🇯🇴', 0.71], ['MAD', 'MAD', 'דירהם מרוקאי', '🇲🇦', 9.8], ['ALL', 'L', 'לק אלבני', '🇦🇱', 92],
  ['RSD', 'дин', 'דינר סרבי', '🇷🇸', 108],
];
export const CURS = C.map(([code, sym, name, flag, usd]) => ({ code, sym, name, flag, usd }));
export const CUR = Object.fromEntries(CURS.map(c => [c.code, c]));

export const COLORS = ['#0FB5A6', '#FF6A4D', '#FFB020', '#6C5CE7', '#2D9CDB', '#E84393', '#27AE60', '#F2784B', '#8E6CEF', '#00B8D9'];
export const TRIP_EMOJI = ['🏝️', '🏔️', '🗼', '🗽', '🏕️', '🚐', '⛷️', '🛕', '🏜️', '🚢', '🎡', '🍜', '🌋', '🦁', '🎒', '🌍'];
