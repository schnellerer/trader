export const colors = {
  bg: '#0A0E14',
  card: '#121821',
  card2: '#18202C',
  border: '#212B3A',
  text: '#E8EEF5',
  muted: '#8392A6',
  green: '#22C55E',
  greenBg: 'rgba(34,197,94,0.14)',
  red: '#F0524F',
  redBg: 'rgba(240,82,79,0.14)',
  accent: '#4C8DFF',
  accentBg: 'rgba(76,141,255,0.14)',
  amber: '#F5B83D',
  amberBg: 'rgba(245,184,61,0.14)',
};

export const radius = { s: 8, m: 14, l: 20 };
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 24 };

export const signColor = (v: number) => (v > 0 ? colors.green : v < 0 ? colors.red : colors.muted);
