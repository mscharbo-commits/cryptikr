// Serverless function — allows 60s timeout for Sonnet streaming

const CORS = { 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' };
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const FINNHUB = process.env.FINNHUB_KEY || 'd95c889r01qihq3l33k0d95c889r01qihq3l33kg';
const CG_KEY  = process.env.COINGECKO_API_KEY || '';
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Server-side cache — persists across requests on same edge instance
const _cache = {};

async function sf(url, t=8000) {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), t);
  try {
    const hdrs = url.includes('coingecko') && CG_KEY ? { 'x-cg-demo-api-key': CG_KEY } : {};
    const r = await fetch(url, { signal: ctrl.signal, headers: hdrs });
    clearTimeout(id);
    return r.ok ? await r.json() : null;
  } catch(e) { clearTimeout(id); return null; }
}

const COIN_KWS = {
  bitcoin:['bitcoin','btc'], ethereum:['ethereum','eth'], solana:['solana','sol'],
  ripple:['ripple','xrp'], dogecoin:['dogecoin','doge'], cardano:['cardano','ada'],
  'avalanche-2':['avalanche','avax'], polkadot:['polkadot','dot'], chainlink:['chainlink','link'],
  'matic-network':['polygon','matic'], near:['near protocol','near'], aptos:['aptos','apt'],
  arbitrum:['arbitrum','arb'], cosmos:['cosmos','atom'], 'shiba-inu':['shiba','shib'],
};

async function fetchContext(coinId) {
  const cacheKey = 'ctx_' + coinId;
  if (_cache[cacheKey] && Date.now() - _cache[cacheKey].ts < CACHE_TTL) {
    return _cache[cacheKey].data;
  }

  const [coinDetail, priceData, globalData, cryptoNews] = await Promise.all([
    sf(`https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`),
    sf(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId},bitcoin&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`),
    sf('https://api.coingecko.com/api/v3/global'),
    fetch(`https://finnhub.io/api/v1/news?category=crypto&token=${FINNHUB}`).then(r => r.ok ? r.json() : []).catch(() => []),
  ]);

  const m   = coinDetail?.market_data || {};
  const p   = priceData?.[coinId] || {};
  const btc = priceData?.bitcoin || {};
  const g   = globalData?.data || {};

  const price  = p.usd || m.current_price?.usd || 0;
  const chg24  = p.usd_24h_change || m.price_change_percentage_24h || 0;
  const chg7   = m.price_change_percentage_7d || 0;
  const chg30  = m.price_change_percentage_30d || 0;
  const sym    = (coinDetail?.symbol || coinId).toUpperCase();
  const name   = coinDetail?.name || coinId;
  const mktCap = p.usd_market_cap || m.market_cap?.usd || 0;
  const fdv    = m.fully_diluted_valuation?.usd || 0;
  const vol24  = p.usd_24h_vol || m.total_volume?.usd || 0;
  const circ   = m.circulating_supply || 0;
  const maxSup = m.max_supply;
  const ath    = m.ath?.usd || 0;
  const athChg = m.ath_change_percentage?.usd || 0;
  const sentUp = coinDetail?.sentiment_votes_up_percentage || 0;
  const rank   = coinDetail?.market_cap_rank || '?';
  const btcDom = g.market_cap_percentage?.btc?.toFixed(1) || '?';
  const totalMkt = g.total_market_cap?.usd || 0;
  const mktChg = g.market_cap_change_percentage_24h_usd?.toFixed(2) || '?';

  const kws = COIN_KWS[coinId] || [name.toLowerCase(), sym.toLowerCase()];
  const coinNews = Array.isArray(cryptoNews)
    ? cryptoNews.filter(n => { const t = ((n.headline||'')+(n.summary||'')).toLowerCase(); return kws.some(k => t.includes(k)); }).slice(0, 5)
    : [];
  const macroNews = Array.isArray(cryptoNews)
    ? cryptoNews.filter(n => !coinNews.includes(n)).slice(0, 4)
    : [];

  function fmtN(n) {
    if (!n) return 'N/A';
    if (n >= 1e12) return '$' + (n/1e12).toFixed(2) + 'T';
    if (n >= 1e9)  return '$' + (n/1e9).toFixed(2) + 'B';
    if (n >= 1e6)  return '$' + (n/1e6).toFixed(2) + 'M';
    return '$' + n.toFixed(2);
  }

  const ctx = {
    name, sym, price, chg24, chg7, chg30, mktCap, fdv, vol24,
    circ, maxSup, ath, athChg, sentUp, rank, btcDom, totalMkt, mktChg,
    btcPrice: btc.usd || 0, btcChg: btc.usd_24h_change || 0,
    coinNews, macroNews, fmtN,
  };

  _cache[cacheKey] = { ts: Date.now(), data: ctx };
  return ctx;
}

function buildDataBlock(c) {
  var parts = [
    'COIN: ' + c.name + ' (' + c.sym + ') | Price: $' + c.price.toLocaleString() + ' | 24h: ' + c.chg24.toFixed(2) + '% | 7D: ' + c.chg7.toFixed(2) + '% | 30D: ' + c.chg30.toFixed(2) + '%',
    'Market Cap: ' + c.fmtN(c.mktCap) + ' | FDV: ' + c.fmtN(c.fdv) + ' | Rank: #' + c.rank + ' | Volume: ' + c.fmtN(c.vol24),
    'Supply: ' + (c.circ ? c.circ.toLocaleString() : 'N/A') + ' / ' + (c.maxSup ? c.maxSup.toLocaleString() : 'Unlimited') + ' | ATH: $' + c.ath.toLocaleString() + ' (' + c.athChg.toFixed(1) + '% away)',
    'Sentiment: ' + c.sentUp.toFixed(0) + '% bullish | BTC Dom: ' + c.btcDom + '% | Total Mkt: ' + c.fmtN(c.totalMkt) + ' (' + c.mktChg + '% 24h)',
  ];
  if (c.coinNews.length > 0) {
    parts.push('COIN NEWS:');
    c.coinNews.forEach(function(n, i) { parts.push((i+1) + '. ' + n.headline); });
  } else { parts.push('No recent coin-specific news.'); }
  parts.push('MACRO NEWS:');
  c.macroNews.forEach(function(n, i) { parts.push((i+1) + '. ' + n.headline); });
  return parts.join('\n');
}

async function streamAI(prompt, maxTokens) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  return resp;
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const { searchParams } = new URL(req.url);
  const coinId = (searchParams.get('id') || '').toLowerCase();
  const mode   = searchParams.get('mode') || 'summary'; // 'summary' or 'deep'

  // Market overview mode — no coinId needed
  if (mode === 'market') {
    const mk = 'market_overview';
    if (_cache[mk] && Date.now() - _cache[mk].ts < CACHE_TTL) {
      const ct = _cache[mk].text;
      // Only serve if complete — starts with capital letter, ends with period
      if (ct && ct.length > 80 && /^[A-Z]/.test(ct.trim()) && /[.!?]$/.test(ct.trim())) {
        return new Response(ct, { headers: {...CORS, 'Content-Type':'text/plain', 'X-Cache':'HIT'} });
      }
    }
    const gData = await sf('https://api.coingecko.com/api/v3/global');
    const cNews = await fetch('https://finnhub.io/api/v1/news?category=crypto&token=' + FINNHUB).then(function(r){return r.ok?r.json():[];}).catch(function(){return [];});
    const g = (gData && gData.data) ? gData.data : {};
    const btcD = (g.market_cap_percentage && g.market_cap_percentage.btc) ? g.market_cap_percentage.btc.toFixed(1) : '?';
    const totM = (g.total_market_cap && g.total_market_cap.usd) ? g.total_market_cap.usd : 0;
    const mChg = g.market_cap_change_percentage_24h_usd ? g.market_cap_change_percentage_24h_usd.toFixed(2) : '?';
    function fmtB(n){if(!n)return 'N/A';if(n>=1e12)return '$'+(n/1e12).toFixed(2)+'T';if(n>=1e9)return '$'+(n/1e9).toFixed(2)+'B';return '$'+n.toFixed(0);}
    const hdls = Array.isArray(cNews) ? cNews.slice(0,6).map(function(n,i){return (i+1)+'. '+n.headline;}).join('\n') : 'No news.';
    const mp = 'You are CryptikrAI. Write exactly 3 complete sentences as a crypto market briefing for institutional investors. Plain prose only — no headers, no bullets, no markdown, no incomplete sentences. Every sentence must be complete and end with a period.\n\nData: Total Market Cap: ' + fmtB(totM) + ' (' + mChg + '% 24h) | BTC Dominance: ' + btcD + '% | Active Coins: ' + (g.active_cryptocurrencies||'?') + '\nTop News Headlines:\n' + hdls + '\n\nSentence 1: State overall market conditions with specific dollar figures and percentages. Sentence 2: Name the single most important catalyst from the news and its market implication. Sentence 3: State what institutional investors should watch or act on right now. Write all three sentences. Each must be complete.';
    const mr = await streamAI(mp, 250);
    if (!mr.ok) return new Response('Market failed', {status:500, headers:CORS});
    const reader2 = mr.body.getReader(); const dec2 = new TextDecoder(); let mt = ''; let buf2 = '';
    while(true){
      const {done,value}=await reader2.read();
      if(done)break;
      buf2 += dec2.decode(value,{stream:true});
      const lines2 = buf2.split('\n');
      buf2 = lines2.pop() || '';
      for(const ln of lines2){
        if(!ln.startsWith('data:'))continue;
        const dd=ln.slice(5).trim();
        if(dd==='[DONE]')continue;
        try{const p=JSON.parse(dd);mt+=(p.delta&&p.delta.text)||'';}catch(e){}
      }
    }
    _cache[mk] = {ts:Date.now(), text:mt};
    return new Response(mt, {headers:{...CORS,'Content-Type':'text/plain','X-Cache':'MISS'}});
  }

  // Market DEEP DIVE mode — full streaming 5-section analysis
  if (mode === 'market-deep') {
    const gData2 = await sf('https://api.coingecko.com/api/v3/global');
    const btcData = await sf('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=usd&include_24hr_change=true&include_market_cap=true');
    const cNews2 = await fetch('https://finnhub.io/api/v1/news?category=crypto&token=' + FINNHUB).then(function(r){return r.ok?r.json():[];}).catch(function(){return [];});
    const g2 = (gData2 && gData2.data) ? gData2.data : {};
    const btc2 = (btcData && btcData.bitcoin) ? btcData.bitcoin : {};
    const eth2 = (btcData && btcData.ethereum) ? btcData.ethereum : {};
    const sol2 = (btcData && btcData.solana) ? btcData.solana : {};
    function fmtB2(n){if(!n)return 'N/A';if(n>=1e12)return '$'+(n/1e12).toFixed(2)+'T';if(n>=1e9)return '$'+(n/1e9).toFixed(2)+'B';return '$'+n.toFixed(0);}
    const totM2 = (g2.total_market_cap && g2.total_market_cap.usd) ? g2.total_market_cap.usd : 0;
    const mChg2 = g2.market_cap_change_percentage_24h_usd ? g2.market_cap_change_percentage_24h_usd.toFixed(2) : '?';
    const btcDom2 = (g2.market_cap_percentage && g2.market_cap_percentage.btc) ? g2.market_cap_percentage.btc.toFixed(1) : '?';
    const ethDom2 = (g2.market_cap_percentage && g2.market_cap_percentage.eth) ? g2.market_cap_percentage.eth.toFixed(1) : '?';
    const hdls2 = Array.isArray(cNews2) ? cNews2.slice(0,8).map(function(n,i){return (i+1)+'. '+n.headline;}).join('\n') : 'No news.';
    const dp = 'You are CryptikrAI. Write an institutional crypto market deep dive. Use ONLY these exact section headers with --- dividers. No other markdown. Complete every section fully.\n\n' + 'MARKET DATA:\nTotal Market Cap: ' + fmtB2(totM2) + ' (' + mChg2 + '% 24h) | BTC Dom: ' + btcDom2 + '% | ETH Dom: ' + ethDom2 + '%\nBTC: $' + (btc2.usd||0).toLocaleString() + ' (' + (btc2.usd_24h_change||0).toFixed(2) + '% 24h)\nETH: $' + (eth2.usd||0).toLocaleString() + ' (' + (eth2.usd_24h_change||0).toFixed(2) + '% 24h)\nSOL: $' + (sol2.usd||0).toLocaleString() + ' (' + (sol2.usd_24h_change||0).toFixed(2) + '% 24h)\n\nNEWS:\n' + hdls2 + '\n\nFormat exactly:\n\n## Market Structure\n[3 sentences: market cap context, BTC vs ETH momentum, volume signal]\n\n## Capital Rotation\n[3 sentences: what ' + btcDom2 + '% BTC dominance means, rotation signals, trigger for altseason]\n\n## News Catalysts\n[3 sentences: top bullish catalyst with price impact, top bearish risk with downside, what market is mispricing]\n\n## Bull vs Bear\n[Bull scenario with market cap target and probability. Bear scenario with market cap downside and probability.]\n\n## Positioning\n[3 sentences: exact allocation percentages, best trade this week, what invalidates the view]';
    streamAI(dp, 1500, 'claude-sonnet-4-6');
    if (!dr.ok) return new Response('Deep dive failed', {status:500, headers:CORS});
    return new Response(dr.body, {headers:{'Content-Type':'text/event-stream','Access-Control-Allow-Origin':'*','Cache-Control':'no-store'}});
  }

  if (!coinId || !ANTHROPIC_KEY) {
    return new Response('Missing params', { status: 400, headers: CORS });
  }

  // Check response cache
  const cacheKey = `${mode}_${coinId}`;
  if (_cache[cacheKey] && Date.now() - _cache[cacheKey].ts < CACHE_TTL) {
    return new Response(_cache[cacheKey].text, {
      headers: { ...CORS, 'Content-Type': 'text/plain', 'X-Cache': 'HIT' }
    });
  }

  const c = await fetchContext(coinId);

  if (mode === 'summary') {
    // Fast 2-sentence summary — cached as plain text
    const prompt = `You are CryptikrAI. Write exactly 2 sentences summarizing the current state of ${c.name} (${c.sym}) for an institutional investor. Be direct, specific, no fluff.

${buildDataBlock(c)}

Two sentences only. First sentence: price action and momentum with specific numbers. Second sentence: the single most important catalyst or risk right now.`;

    const resp = await streamAI(prompt, 150);
    if (!resp.ok) return new Response('Summary failed', { status: 500, headers: CORS });

    // Collect full response for caching
    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value, { stream: true }).split('\n');
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        try { full += JSON.parse(data).delta?.text || ''; } catch(e) {}
      }
    }
    _cache[cacheKey] = { ts: Date.now(), text: full };
    return new Response(full, {
      headers: { ...CORS, 'Content-Type': 'text/plain', 'X-Cache': 'MISS' }
    });
  }

  // Deep dive — streamed, 5 sections
  const prompt = `You are CryptikrAI, an institutional crypto analyst. Write a deep dive on ${c.name} (${c.sym}). Direct, authoritative, specific numbers in every sentence. No hedging.

${buildDataBlock(c)}

Write exactly 5 sections, 3-4 sentences each:

## Market Position
Price action, momentum, volume, ATH context.

## Tokenomics
Supply structure, FDV vs market cap, inflation or scarcity dynamics.

## News Catalysts  
The 2-3 most important current catalysts from the news above. What they mean for price.

## Bull & Bear
Bull: 2 price targets with specific levels and reasoning. Bear: 2 downside scenarios with levels.

## Entry Strategy
Key support and resistance levels. Positioning guidance. What invalidates the bull thesis.`;

  const resp = await streamAI(prompt, 900);
  if (!resp.ok) return new Response('Deep dive failed', { status: 500, headers: CORS });

  return new Response(resp.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    }
  });
}
