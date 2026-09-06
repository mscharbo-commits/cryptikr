export const config = { runtime: 'edge' };
const CORS = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json','Cache-Control':'public, max-age=300'};
const FINNHUB = process.env.FINNHUB_KEY || 'd95c889r01qihq3l33k0d95c889r01qihq3l33kg';

const COIN_KWS = {
  'bitcoin':['bitcoin','btc'],'ethereum':['ethereum','eth'],'solana':['solana','sol'],
  'ripple':['ripple','xrp'],'dogecoin':['dogecoin','doge'],'cardano':['cardano','ada'],
  'avalanche-2':['avalanche','avax'],'polkadot':['polkadot','dot'],'chainlink':['chainlink','link'],
  'matic-network':['polygon','matic'],'near':['near protocol','near'],'aptos':['aptos','apt'],
  'arbitrum':['arbitrum','arb'],'cosmos':['cosmos','atom'],'shiba-inu':['shiba','shib'],
};

const FINANCIAL_KWS = ['crypto','bitcoin','ethereum','blockchain','stablecoin','defi','fed','rate','inflation','dollar','treasury','market','economy','digital asset'];

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, {headers:CORS});
  var params = new URL(req.url).searchParams;
  var coin  = (params.get('coin') || '').toLowerCase();
  var limit = parseInt(params.get('limit') || '15');

  try {
    var ctrl = new AbortController();
    setTimeout(function() { ctrl.abort(); }, 8000);

    var cryptoUrl  = 'https://finnhub.io/api/v1/news?category=crypto&token=' + FINNHUB;
    var generalUrl = 'https://finnhub.io/api/v1/news?category=general&token=' + FINNHUB;

    var results = await Promise.all([
      fetch(cryptoUrl, {signal: ctrl.signal}).then(function(r) { return r.ok ? r.json() : []; }).catch(function() { return []; }),
      fetch(generalUrl).then(function(r) { return r.ok ? r.json() : []; }).catch(function() { return []; }),
    ]);

    var cryptoNews  = Array.isArray(results[0]) ? results[0] : [];
    var generalNews = Array.isArray(results[1]) ? results[1] : [];

    // Filter general news for financial relevance
    var filteredGeneral = generalNews.filter(function(n) {
      var t = ((n.headline || '') + (n.summary || '')).toLowerCase();
      return FINANCIAL_KWS.some(function(k) { return t.indexOf(k) >= 0; });
    });

    var news = cryptoNews.concat(filteredGeneral);

    // Filter by coin if specified
    if (coin && COIN_KWS[coin]) {
      var kws = COIN_KWS[coin];
      news = news.filter(function(n) {
        var t = ((n.headline || '') + (n.summary || '')).toLowerCase();
        return kws.some(function(k) { return t.indexOf(k) >= 0; });
      });
    }

    // Deduplicate
    var seen = new Set();
    news = news.filter(function(n) {
      if (!n.headline || seen.has(n.headline)) return false;
      seen.add(n.headline);
      return true;
    }).slice(0, limit).map(function(n) {
      return {
        headline: n.headline,
        summary:  (n.summary || '').slice(0, 200),
        source:   n.source || '',
        url:      n.url || '',
        datetime: n.datetime || 0,
      };
    });

    return new Response(JSON.stringify(news), {headers: CORS});
  } catch(e) {
    return new Response(JSON.stringify([]), {headers: CORS});
  }
}
