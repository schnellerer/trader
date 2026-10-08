// Beobachtete Aktien für Top-10-Ranking und Bots (kostenlose Datenlimits → feste Auswahl)
export const US_STOCKS = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'JPM', 'V', 'MA', 'UNH', 'XOM', 'LLY', 'COST',
  'NFLX', 'AMD', 'ORCL', 'ADBE', 'CRM', 'PEP', 'KO', 'WMT', 'DIS', 'BA', 'INTC', 'UBER', 'PLTR', 'QCOM', 'NOW',
];

export const DE_STOCKS = [
  'SAP.DE', 'SIE.DE', 'ALV.DE', 'DTE.DE', 'MBG.DE', 'BMW.DE', 'VOW3.DE', 'BAS.DE', 'ADS.DE', 'IFX.DE', 'RHM.DE', 'MUV2.DE', 'DBK.DE', 'AIR.DE',
];

export const UNIVERSE = [...US_STOCKS, ...DE_STOCKS];

// Für das Day-Trading: liquide Werte mit enger Handelsspanne
export const DAY_UNIVERSE = [
  'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AMD', 'NFLX', 'AVGO', 'JPM', 'PLTR', 'UBER', 'INTC', 'QCOM',
  'SAP.DE', 'SIE.DE', 'ALV.DE', 'DTE.DE', 'IFX.DE', 'RHM.DE',
];

export const INDICES = [
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^GDAXI', name: 'DAX' },
  { symbol: '^IXIC', name: 'Nasdaq' },
  { symbol: '^STOXX50E', name: 'Euro Stoxx 50' },
  { symbol: 'EURUSD=X', name: 'EUR / USD' },
  { symbol: 'BTC-USD', name: 'Bitcoin' },
  { symbol: 'GC=F', name: 'Gold' },
];
