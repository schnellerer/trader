// Adresse der täglich berechneten Ranking-Datei (GitHub). Leer lassen = App nutzt nur die lokale Auswahl von 44 Aktien.
export const RANKING_URL = 'https://raw.githubusercontent.com/schnellerer/trader/main/data/ranking.json';

// Weitere täglich berechnete Dateien (liegen neben ranking.json)
const DATA_BASE = RANKING_URL.replace(/ranking\.json$/, '');
export const SCAN_URL = `${DATA_BASE}scan.json`; // alle ausgewerteten Aktien für den Scanner
export const BACKTEST_URL = `${DATA_BASE}backtest.json`; // Ergebnisse der Strategie-Tests
export const TRACK_URL = `${DATA_BASE}track.json`; // Prognose-Zeugnis
export const WAF_URL = `${DATA_BASE}waf.json`; // W.A.F – We-Are-Fucked-Score für Deutschland
export const FUNDAMENTALS_URL = `${DATA_BASE}fundamentals.json`; // Kennzahlen aller Aktien (Bewertung, Wachstum, Analysten …)

// Stand der Trading-Bots (wird vom GitHub-Server fortlaufend aktualisiert)
export const BOTS_URL = 'https://raw.githubusercontent.com/schnellerer/trader/data/bots.json';

// Zweite Quelle für denselben Stand (GitHub-API, speichert weniger lang zwischen als die Download-Adresse)
export const BOTS_API_URL = 'https://api.github.com/repos/schnellerer/trader/contents/bots.json?ref=data';

// Repository und Aufträge für die Risiko-Regler
export const GITHUB_REPO = 'schnellerer/trader';
export const RISK_WORKFLOW = 'bot-settings.yml';
export const RISK_PAGE = `https://github.com/${GITHUB_REPO}/actions/workflows/${RISK_WORKFLOW}`;
export const TOKEN_PAGE = 'https://github.com/settings/personal-access-tokens/new';

// Seite zum Zurücksetzen der Bots / Ändern des Startkapitals
export const RESET_PAGE = 'https://github.com/schnellerer/trader/actions/workflows/reset-bots.yml';
export const BOTS_PAGE = 'https://github.com/schnellerer/trader/actions/workflows/bots.yml';
