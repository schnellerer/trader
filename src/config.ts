// Adresse der täglich berechneten Ranking-Datei (GitHub). Leer lassen = App nutzt nur die lokale Auswahl von 44 Aktien.
export const RANKING_URL = 'https://raw.githubusercontent.com/schnellerer/trader/main/data/ranking.json';

// Stand der Trading-Bots (wird vom GitHub-Server fortlaufend aktualisiert)
export const BOTS_URL = 'https://raw.githubusercontent.com/schnellerer/trader/data/bots.json';

// Zweite Quelle für denselben Stand (GitHub-API, speichert weniger lang zwischen als die Download-Adresse)
export const BOTS_API_URL = 'https://api.github.com/repos/schnellerer/trader/contents/bots.json?ref=data';

// Seite zum Zurücksetzen der Bots / Ändern des Startkapitals
export const RESET_PAGE = 'https://github.com/schnellerer/trader/actions/workflows/reset-bots.yml';
export const BOTS_PAGE = 'https://github.com/schnellerer/trader/actions/workflows/bots.yml';
