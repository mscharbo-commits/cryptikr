export const config = { runtime: 'edge', maxDuration: 60 };
const CORS = {'Access-Control-Allow-Origin':'*','Content-Type':'text/plain','Cache-Control':'no-store'};
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || '';
const FINNHUB = process.env.FINNHUB_KEY || 'd95c889r01qihq3l33k0d95c889r01qihq3l33kg';
const CG_KEY  = process.env.COINGECKO_API_KEY || '';

async function sf(url, t=8000) {
  const ctrl = new AbortController();
  const id = setTimeout(()=>ctrl.abort(),t);
  try {
    const headers = url.includes('coingecko') && CG_KEY ? {'x-cg-demo-api-key':CG_KEY} : {};
    const r = await fetch(url,{signal:ctrl.signal,headers});
    clearTimeout(id);
    return r.ok ? await r.json() : null;
  } catch(e){clearTimeout(id);return null;}
}

const COIN_KEYWORDS = {
  bitcoin:['bitcoin','btc'],ethereum:['ethereum','eth'],solana:['solana','sol'],
  ripple:['ripple','xrp'],dogecoin:['dogecoin','doge'],cardano:['cardano','ada'],
  'avalanche-2':['avalanche','avax'],polkadot:['polkadot','dot'],chainlink:['chainlink','link'],
  'matic-network':['polygon','matic'],near:['near protocol','near'],aptos:['aptos','apt'],
  arbitrum:['arbitrum','arb'],cosmos:['cosmos','atom'],'shiba-inu':['shiba','shib'],
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null,{headers:{...CORS,'Content-Type':'text/plain'}});
  const {searchParams} = new URL(req.url);
  const coinId = (searchParams.get('id')||'').toLowerCase();
  if (!coinId || !ANTHROPIC_KEY) return new Response('Missing params',{status:400,headers:CORS});

  // Fetch coin data + macro + news in parallel
  const [coinDetail, priceData, globalData, cryptoNews, macroNews] = await Promise.all([
    sf(`https://api.coingecko.com/api/v3/coins/${coinId}?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false`),
    sf(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId},bitcoin&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`),
    sf('https://api.coingecko.com/api/v3/global'),
    fetch(`https://finnhub.io/api/v1/news?category=crypto&token=${FINNHUB}`).then(r=>r.ok?r.json():[]).catch(()=>[]),
    fetch(`https://finnhub.io/api/v1/news?category=general&token=${FINNHUB}`).then(r=>r.ok?r.json():[]).catch(()=>[]),
  ]);

  const m  = coinDetail?.market_data || {};
  const p  = priceData?.[coinId] || {};
  const g  = globalData?.data || {};
  const btc = priceData?.bitcoin || {};

  const price    = p.usd || m.current_price?.usd || 0;
  const chg24    = p.usd_24h_change || m.price_change_percentage_24h || 0;
  const chg7     = m.price_change_percentage_7d || 0;
  const chg30    = m.price_change_percentage_30d || 0;
  const sym      = (coinDetail?.symbol||coinId).toUpperCase();
  const name     = coinDetail?.name || coinId;
  const mktCap   = p.usd_market_cap || m.market_cap?.usd || 0;
  const fdv      = m.fully_diluted_valuation?.usd || 0;
  const vol24    = p.usd_24h_vol || m.total_volume?.usd || 0;
  const circ     = m.circulating_supply || 0;
  const maxSup   = m.max_supply;
  const ath      = m.ath?.usd || 0;
  const athChg   = m.ath_change_percentage?.usd || 0;
  const sentUp   = coinDetail?.sentiment_votes_up_percentage || 0;
  const rank     = coinDetail?.market_cap_rank || '?';
  const btcDom   = g.market_cap_percentage?.btc?.toFixed(1) || '?';
  const totalMkt = g.total_market_cap?.usd || 0;
  const mktChg   = g.market_cap_change_percentage_24h_usd?.toFixed(2) || '?';

  // Filter coin-specific news
  const kws = COIN_KEYWORDS[coinId] || [name.toLowerCase(), sym.toLowerCase()];
  const coinNews = Array.isArray(cryptoNews)
    ? cryptoNews.filter(n => {
        const t = ((n.headline||'')+(n.summary||'')).toLowerCase();
        return kws.some(k => t.includes(k));
      }).slice(0,6)
    : [];

  const macroHeadlines = Array.isArray(cryptoNews)
    ? cryptoNews.filter(n => !coinNews.includes(n)).slice(0,5)
    : [];

  function fmtN(n) {
    if(!n) return 'N/A';
    if(n>=1e12) return '$'+(n/1e12).toFixed(2)+'T';
    if(n>=1e9)  return '$'+(n/1e9).toFixed(2)+'B';
    if(n>=1e6)  return '$'+(n/1e6).toFixed(2)+'M';
    return '$'+n.toFixed(2);
  }

  const prompt = `You are CryptikrAI, an institutional-grade crypto analyst. Write a deep dive analysis of ${name} (${sym}) for sophisticated investors. Write with authority and precision — no hedging language, no disclaimers, no "it's important to note."

MARKET DATA:
- Price: $${price.toLocaleString()} | 24h: ${chg24.toFixed(2)}% | 7D: ${chg7.toFixed(2)}% | 30D: ${chg30.toFixed(2)}%
- Market Cap: ${fmtN(mktCap)} | FDV: ${fmtN(fdv)} | Rank: #${rank}
- 24h Volume: ${fmtN(vol24)} | Vol/MCap: ${mktCap ? (vol24/mktCap*100).toFixed(2)+'%' : 'N/A'}
- Circulating: ${circ ? circ.toLocaleString() : 'N/A'} ${sym} | Max Supply: ${maxSup ? maxSup.toLocaleString() : 'Unlimited'}
- ATH: $${ath.toLocaleString()} | From ATH: ${athChg.toFixed(1)}%
- Community Sentiment: ${sentUp.toFixed(0)}% bullish

MACRO CRYPTO CONTEXT:
- BTC Dominance: ${btcDom}% | Total Market Cap: ${fmtN(totalMkt)} (${mktChg}% 24h)
- BTC Price: $${(btc.usd||0).toLocaleString()} (${(btc.usd_24h_change||0).toFixed(2)}% 24h)

${coinNews.length > 0 ? `RECENT ${sym} NEWS (last 48hrs):
${coinNews.map((n,i) => `${i+1}. ${n.headline}`).join('\n')}` : ''}

${macroHeadlines.length > 0 ? `MACRO CRYPTO NEWS:
${macroHeadlines.map((n,i) => `${i+1}. ${n.headline}`).join('\n')}` : ''}

Write exactly 5 sections with these headers:

## Market Position & Momentum
Analyze price action, volume, and momentum across timeframes. Reference specific numbers. Assess where ${sym} sits relative to its ATH and what that implies.

## Tokenomics & Supply Dynamics  
Analyze circulating vs max supply, FDV vs market cap ratio, inflation pressure or scarcity. What does the supply structure mean for price?

## News Catalyst Analysis
Interpret the news items above. What are the key catalysts driving or threatening ${sym} right now? What macro crypto trends apply?

## Bull Case & Bear Case
Bull: 3 specific reasons with price targets. Bear: 3 specific risks with downside scenarios. Be direct.

## Entry & Risk Strategy
Specific support levels, resistance levels, and position sizing guidance. What conditions would change the thesis?`;

  // Stream from Anthropic
  const anthropicResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      stream: true,
      messages: [{role:'user', content: prompt}],
    }),
  });

  if (!anthropicResp.ok) {
    const err = await anthropicResp.text();
    return new Response('Analysis failed: '+err, {status:500, headers:CORS});
  }

  return new Response(anthropicResp.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    }
  });
}