export const config = { runtime: 'edge' };
const CORS = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json','Cache-Control':'public, max-age=300'};
const FINNHUB = process.env.FINNHUB_KEY || 'd95c889r01qihq3l33k0d95c889r01qihq3l33kg';

const COIN_KEYWORDS = {
  bitcoin:['bitcoin','btc'],'ethereum':['ethereum','eth'],'solana':['solana','sol'],
  ripple:['ripple','xrp'],'dogecoin':['dogecoin','doge'],'cardano':['cardano','ada'],
  'avalanche-2':['avalanche','avax'],'polkadot':['polkadot','dot'],'chainlink':['chainlink','link'],
  'matic-network':['polygon','matic'],'uniswap':['uniswap','uni'],'near':['near protocol','near'],
  'aptos':['aptos','apt'],'arbitrum':['arbitrum','arb'],'cosmos':['cosmos','atom'],
  'shiba-inu':['shiba','shib'],'tron':['tron','trx'],'the-open-network':['toncoin','ton'],
  'sui':['sui network','sui'],'pepe':['pepe','meme coin'],'aave':['aave','defi'],
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, {headers:CORS});
  const {searchParams} = new URL(req.url);
  const coin = (searchParams.get('coin')||'').toLowerCase();
  const limit = parseInt(searchParams.get('limit')||'15');

  try {
    const ctrl = new AbortController();
    setTimeout(()=>ctrl.abort(), 8000);
    const r = await fetch(
      `https://finnhub.io/api/v1/news?category=crypto&token=${FINNHUB}`,
      {signal: ctrl.signal}
    );
    if (!r.ok) return new Response(JSON.stringify([]), {headers:CORS});
    let news = await r.json();
    if (!Array.isArray(news)) return new Response(JSON.stringify([]), {headers:CORS});

    // Filter by coin keywords if specified
    if (coin && COIN_KEYWORDS[coin]) {
      const kws = COIN_KEYWORDS[coin];
      news = news.filter(n => {
        const text = ((n.headline||'')+(n.summary||'')).toLowerCase();
        return kws.some(k => text.includes(k));
      });
    }

    // Deduplicate and format
    const seen = new Set();
    news = news.filter(n => {
      if (seen.has(n.headline)) return false;
      seen.add(n.headline); return true;
    }).slice(0, limit).map(n => ({
      headline: n.headline,
      summary:  (n.summary||'').slice(0, 200),
      source:   n.source,
      url:      n.url,
      image:    n.image||'',
      datetime: n.datetime,
    }));

    return new Response(JSON.stringify(news), {headers:CORS});
  } catch(e) {
    return new Response(JSON.stringify([]), {headers:CORS});
  }
}