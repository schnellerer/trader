// Farbwelt: Schwarz, Weiß und Grün. Rot und Gelb bleiben nur als Signalfarben für Verlust und Warnung.
export const colors = {
  bg: '#000000',
  card: '#0B0F0C',
  card2: '#141B16',
  border: '#1F2B23',
  text: '#FFFFFF',
  muted: '#92A398',
  green: '#2BE36F',
  greenBg: 'rgba(43,227,111,0.15)',
  red: '#FF5C5C',
  redBg: 'rgba(255,92,92,0.15)',
  accent: '#2BE36F',
  accentBg: 'rgba(43,227,111,0.15)',
  amber: '#F5C542',
  amberBg: 'rgba(245,197,66,0.15)',
  onAccent: '#000000', // Schrift auf grünen Flächen
};

/** Einheitliche Schriftgrößen für die ganze App */
export const type = {
  display: 30, // große Zahlen (Depotwert)
  title: 26, // Seitentitel
  h1: 18, // Aktienkürzel, Karten-Überschriften
  h2: 16, // Preise, Abschnittstitel
  value: 15, // Kennzahlen
  body: 14, // Fließtext, Chips
  small: 12, // Beschriftungen, Hinweise
  micro: 11, // Kleinstes (nur Überschriften in Großbuchstaben)
};

export const radius = { s: 8, m: 14, l: 20 };
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24 };

export const signColor = (v: number) => (v > 0 ? colors.green : v < 0 ? colors.red : colors.muted);
