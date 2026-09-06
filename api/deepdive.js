export const config = { runtime: 'edge', maxDuration: 60 };

const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const FINNHUB = process.env.FINNHUB_KEY || 'd95c889r01qihq3l33k0d95c889r01qihq3l33kg';
const CG_KEY  = process.env.COINGECKO_API_KEY || '';
const CACHE_TTL = 30 * 60 * 1000;
const _cache = {};

async function sf(url, t) {
  t = t || 8000;
  var ctrl = new AbortController();
  var id = setTimeout(function() { ctrl.abort(); }, t);
  try {
    var hdrs = (url.indexOf('coingecko') >= 0 && CG_KEY) ? { 'x-cg-demo-api-key': CG_KEY } : {};
    var r = await fetch(url, { signal: ctrl.signal, headers: hdrs });
    clearTimeout(id);
    return r.ok ? await r.json() : null;
  } catch(e) { clearTimeout(id); return null; }
}

var COIN_KWS = {
  'bitcoin':['bitcoin','btc'],'ethereum':['ethereum','eth'],'solana':['solana','sol'],
  'ripple':['ripple','xrp'],'dogecoin':['dogecoin','doge'],'cardano':['cardano','ada'],
  'avalanche-2':['avalanche','avax'],'polkadot':['polkadot','dot'],'chainlink':['chainlink','link'],
  'matic-network':['polygon','matic'],'near':['near protocol','near'],'aptos':['aptos','apt'],
  'arbitrum':['arbitrum','arb'],'cosmos':['cosmos','atom'],'shiba-inu':['shiba','shib'],
};

function fmtN(n) {
  if (!n) return 'N/A';
  if (n >= 1e12) return '$' + (n/1e12).toFixed(2) + 'T';
  if (n >= 1e9)  return '$' + (n/1e9).toFixed(2) + 'B';
  if (n >= 1e6)  return '$' + (n/1e6).toFixed(2) + 'M';
  return '$' + n.toFixed(2);
}

async function getCtx(coinId) {
  var ck = 'ctx_' + coinId;
  if (_cache[ck] && Date.now() - _cache[ck].ts < CACHE_TTL) return _cache[ck].data;

  var results = await Promise.all([
    sf('https://api.coingecko.com/api/v3/coins/' + coinId + '?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false'),
    sf('https://api.coingecko.com/api/v3/simple/price?ids=' + coinId + ',bitcoin&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true'),
    sf('https://api.coingecko.com/api/v3/global'),
    fetch('https://finnhub.io/api/v1/news?category=crypto&token=' + FINNHUB).then(function(r) { return r.ok ? r.json() : []; }).catch(function() { return []; }),
  ]);

  var coinDetail = results[0], priceData = results[1], globalData = results[2], cryptoNews = results[3];
  var m   = (coinDetail && coinDetail.market_data) ? coinDetail.market_data : {};
  var p   = (priceData && priceData[coinId]) ? priceData[coinId] : {};
  var btc = (priceData && priceData.bitcoin) ? priceData.bitcoin : {};
  var g   = (globalData && globalData.data) ? globalData.data : {};

  var kws = COIN_KWS[coinId] || [(coinDetail && coinDetail.name ? coinDetail.name.toLowerCase() : coinId), coinId];
  var coinNews = Array.isArray(cryptoNews)
    ? cryptoNews.filter(function(n) {
        var t = ((n.headline || '') + (n.summary || '')).toLowerCase();
        return kws.some(function(k) { return t.indexOf(k) >= 0; });
      }).slice(0, 5)
    : [];
  var macroNews = Array.isArray(cryptoNews)
    ? cryptoNews.filter(function(n) { return coinNews.indexOf(n) < 0; }).slice(0, 4)
    : [];

  var ctx = {
    name: (coinDetail && coinDetail.name) ? coinDetail.name : coinId,
    sym: (coinDetail && coinDetail.symbol) ? coinDetail.symbol.toUpperCase() : coinId.toUpperCase(),
    price: (p.usd) || (m.current_price && m.current_price.usd) || 0,
    chg24: (p.usd_24h_change) || (m.price_change_percentage_24h) || 0,
    chg7:  m.price_change_percentage_7d || 0,
    chg30: m.price_change_percentage_30d || 0,
    mktCap: (p.usd_market_cap) || (m.market_cap && m.market_cap.usd) || 0,
    fdv: (m.fully_diluted_valuation && m.fully_diluted_valuation.usd) || 0,
    vol24: (p.usd_24h_vol) || (m.total_volume && m.total_volume.usd) || 0,
    circ: m.circulating_supply || 0,
    maxSup: m.max_supply || null,
    ath: (m.ath && m.ath.usd) || 0,
    athChg: (m.ath_change_percentage && m.ath_change_percentage.usd) || 0,
    sentUp: (coinDetail && coinDetail.sentiment_votes_up_percentage) || 0,
    rank: (coinDetail && coinDetail.market_cap_rank) || '?',
    btcDom: (g.market_cap_percentage && g.market_cap_percentage.btc) ? g.market_cap_percentage.btc.toFixed(1) : '?',
    totalMkt: (g.total_market_cap && g.total_market_cap.usd) || 0,
    mktChg: g.market_cap_change_percentage_24h_usd ? g.market_cap_change_percentage_24h_usd.toFixed(2) : '?',
    btcPrice: btc.usd || 0,
    btcChg: btc.usd_24h_change || 0,
    coinNews: coinNews,
    macroNews: macroNews,
  };
  _cache[ck] = { ts: Date.now(), data: ctx };
  return ctx;
}

function buildData(c) {
  var lines = [
    c.name + ' (' + c.sym + ') | Price: $' + c.price.toLocaleString() + ' | 24h: ' + c.chg24.toFixed(2) + '% | 7D: ' + c.chg7.toFixed(2) + '% | 30D: ' + c.chg30.toFixed(2) + '%',
    'Market Cap: ' + fmtN(c.mktCap) + ' | FDV: ' + fmtN(c.fdv) + ' | Rank: #' + c.rank + ' | Vol: ' + fmtN(c.vol24),
    'Circulating: ' + (c.circ ? c.circ.toLocaleString() : 'N/A') + ' | Max: ' + (c.maxSup ? c.maxSup.toLocaleString() : 'Unlimited'),
    'ATH: $' + c.ath.toLocaleString() + ' (' + c.athChg.toFixed(1) + '% away) | Sentiment: ' + c.sentUp.toFixed(0) + '% bullish',
    'BTC Dom: ' + c.btcDom + '% | Total Mkt: ' + fmtN(c.totalMkt) + ' (' + c.mktChg + '% 24h)',
  ];
  if (c.coinNews.length > 0) {
    lines.push('COIN NEWS:');
    c.coinNews.forEach(function(n, i) { lines.push((i+1) + '. ' + n.headline); });
  }
  lines.push('MACRO NEWS:');
  c.macroNews.forEach(function(n, i) { lines.push((i+1) + '. ' + n.headline); });
  return lines.join('\n');
}

async function streamAI(prompt, maxTokens) {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: maxTokens, stream: true, messages: [{ role: 'user', content: prompt }] }),
  });
}

async function collectStream(resp) {
  var reader = resp.body.getReader();
  var decoder = new TextDecoder();
  var full = '';
  while (true) {
    var res = await reader.read();
    if (res.done) break;
    var lines = decoder.decode(res.value, { stream: true }).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (line.indexOf('data:') !== 0) continue;
      var data = line.slice(5).trim();
      if (data === '[DONE]') continue;
      try { full += JSON.parse(data).delta.text || ''; } catch(e) {}
    }
  }
  return full;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  var params = new URL(req.url).searchParams;
  var coinId = (params.get('id') || '').toLowerCase();
  var mode   = params.get('mode') || 'summary';

  if (!coinId || !ANTHROPIC_KEY) return new Response('Missing params', { status: 400, headers: CORS });

  var ck = mode + '_' + coinId;
  if (_cache[ck] && Date.now() - _cache[ck].ts < CACHE_TTL) {
    return new Response(_cache[ck].text, { headers: Object.assign({}, CORS, { 'Content-Type': 'text/plain', 'X-Cache': 'HIT' }) });
  }

  // MARKET MODE
  if (mode === 'market') {
    var gData = await sf('https://api.coingecko.com/api/v3/global');
    var cNews = await fetch('https://finnhub.io/api/v1/news?category=crypto&token=' + FINNHUB).then(function(r) { return r.ok ? r.json() : []; }).catch(function() { return []; });
    var gd = (gData && gData.data) ? gData.data : {};
    var btcD = (gd.market_cap_percentage && gd.market_cap_percentage.btc) ? gd.market_cap_percentage.btc.toFixed(1) : '?';
    var totM = (gd.total_market_cap && gd.total_market_cap.usd) ? fmtN(gd.total_market_cap.usd) : 'N/A';
    var mChg = gd.market_cap_change_percentage_24h_usd ? gd.market_cap_change_percentage_24h_usd.toFixed(2) : '?';
    var headlines = Array.isArray(cNews) ? cNews.slice(0, 6).map(function(n, i) { return (i+1) + '. ' + n.headline; }).join('\n') : 'No news.';
    var mktPrompt = 'You are CryptikrAI. Write exactly 3 sentences giving an institutional overview of the crypto market right now. Direct, specific numbers, no fluff.\n\nTotal Market Cap: ' + totM + ' (' + mChg + '% 24h) | BTC Dominance: ' + btcD + '% | Active coins: ' + (gd.active_cryptocurrencies || '?') + '\nTop crypto news:\n' + headlines + '\n\nThree sentences: (1) Overall market state with specific numbers. (2) Most important catalyst from the news. (3) What sophisticated investors should watch.';
    var mResp = await streamAI(mktPrompt, 180);
    if (!mResp.ok) return new Response('Market failed', { status: 500, headers: CORS });
    var mText = await collectStream(mResp);
    _cache[ck] = { ts: Date.now(), text: mText };
    return new Response(mText, { headers: Object.assign({}, CORS, { 'Content-Type': 'text/plain' }) });
  }

  var c = await getCtx(coinId);
  var data = buildData(c);

  // SUMMARY MODE
  if (mode === 'summary') {
    var sPrompt = 'You are CryptikrAI. Write exactly 2 sentences summarizing ' + c.name + ' (' + c.sym + ') for an institutional investor. Direct, specific numbers, no fluff.\n\n' + data + '\n\nTwo sentences: (1) Price action and momentum with specific numbers. (2) The single most important catalyst or risk right now.';
    var sResp = await streamAI(sPrompt, 120);
    if (!sResp.ok) return new Response('Summary failed', { status: 500, headers: CORS });
    var sText = await collectStream(sResp);
    _cache[ck] = { ts: Date.now(), text: sText };
    return new Response(sText, { headers: Object.assign({}, CORS, { 'Content-Type': 'text/plain' }) });
  }

  // DEEP DIVE MODE - streamed
  var deepPrompt = 'You are CryptikrAI. Institutional crypto analysis of ' + c.name + ' (' + c.sym + '). Direct, specific numbers, no hedging, no disclaimers. Complete every section fully.

' + data + '

Write all 5 sections. 3 sentences each. Be concise and complete.

## Market Position
Price momentum, volume, ATH context.

## Tokenomics
Supply structure, FDV vs mkt cap, inflation or scarcity.

## News Catalysts
Top 2-3 catalysts from news above and price impact.

## Bull vs Bear
Bull: 2 price targets with levels. Bear: 2 downside levels with triggers.

## Entry Strategy
Key support, resistance, position sizing, thesis invalidation.';
  var dResp = await streamAI(deepPrompt, 1200);
  if (!dResp.ok) return new Response('Deep dive failed', { status: 500, headers: CORS });
  return new Response(dResp.body, { headers: { 'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' } });
}
