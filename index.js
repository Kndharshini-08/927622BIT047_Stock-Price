import express from 'express';
import axios from 'axios';

const app = express();
const PORT = 5050;
const STOCK_API_BASE = 'http://20.244.56.144'; // Test server base

// In-memory storage for price history
const priceHistory = {};

// Helper to fetch stock price history from the test API
async function fetchStockHistory(ticker, minutes) {
  const url = `${STOCK_API_BASE}/stocks/${ticker}?minutes=${minutes}`;
  const res = await axios.get(url);
  return res.data.priceHistory;
}

// Helper to calculate average
function calculateAverage(prices) {
  if (!prices.length) return 0;
  return prices.reduce((sum, p) => sum + p.price, 0) / prices.length;
}

// Helper to calculate correlation
function calculateCorrelation(arr1, arr2) {
  if (arr1.length !== arr2.length || arr1.length === 0) return null;
  const n = arr1.length;
  const mean1 = arr1.reduce((a, b) => a + b, 0) / n;
  const mean2 = arr2.reduce((a, b) => a + b, 0) / n;
  let cov = 0, std1 = 0, std2 = 0;
  for (let i = 0; i < n; i++) {
    cov += (arr1[i] - mean1) * (arr2[i] - mean2);
    std1 += (arr1[i] - mean1) ** 2;
    std2 += (arr2[i] - mean2) ** 2;
  }
  cov /= (n - 1);
  std1 = Math.sqrt(std1 / (n - 1));
  std2 = Math.sqrt(std2 / (n - 1));
  if (std1 === 0 || std2 === 0) return null;
  return cov / (std1 * std2);
}

// Endpoint: Average Stock Price in last "m" minutes
app.get('/stocks/:ticker', async (req, res) => {
  const { ticker } = req.params;
  const { minutes, aggregation } = req.query;
  if (!minutes || aggregation !== 'average') {
    return res.status(400).json({ error: 'Missing or invalid parameters' });
  }
  try {
    const history = await fetchStockHistory(ticker, minutes);
    const avg = calculateAverage(history);
    res.json({ averageStockPrice: avg, priceHistory: history });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stock data' });
  }
});

// Endpoint: Correlation of Price Movement between 2 stocks
app.get('/stockcorrelation', async (req, res) => {
  const { minutes, ticker } = req.query;
  if (!minutes || !ticker || !Array.isArray(ticker) && typeof ticker !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid parameters' });
  }
  const tickers = Array.isArray(ticker) ? ticker : [ticker];
  if (tickers.length !== 2) {
    return res.status(400).json({ error: 'Exactly 2 tickers required' });
  }
  try {
    const [h1, h2] = await Promise.all([
      fetchStockHistory(tickers[0], minutes),
      fetchStockHistory(tickers[1], minutes)
    ]);
    // Align by timestamp
    const map1 = Object.fromEntries(h1.map(p => [p.lastUpdatedAt, p.price]));
    const map2 = Object.fromEntries(h2.map(p => [p.lastUpdatedAt, p.price]));
    const commonTimestamps = h1.map(p => p.lastUpdatedAt).filter(ts => ts in map2);
    const arr1 = commonTimestamps.map(ts => map1[ts]);
    const arr2 = commonTimestamps.map(ts => map2[ts]);
    const correlation = calculateCorrelation(arr1, arr2);
    res.json({
      correlation,
      stocks: {
        [tickers[0]]: { averagePrice: calculateAverage(h1), priceHistory: h1 },
        [tickers[1]]: { averagePrice: calculateAverage(h2), priceHistory: h2 }
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch or correlate stock data' });
  }
});

// Root endpoint with API information
app.get('/', (req, res) => {
  res.json({
    message: 'Stock API is running',
    endpoints: {
      '/stocks/:ticker': {
        method: 'GET',
        description: 'Get average stock price for a ticker',
        queryParams: {
          minutes: 'Number of minutes to look back',
          aggregation: 'Must be "average"'
        }
      },
      '/stockcorrelation': {
        method: 'GET',
        description: 'Get correlation between two stocks',
        queryParams: {
          minutes: 'Number of minutes to look back',
          ticker: 'Array of two stock tickers'
        }
      }
    }
  });
});

app.listen(PORT, () => {
  console.log(`Stock backend running on http://localhost:${PORT}`);
}); 