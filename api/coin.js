export const config = { runtime: 'edge' };
const CORS = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json','Cache-Control':'public, max-age=60'};
const CG_KEY = process.env.COINGECKO_API_KEY || '';

var META = {
  'bitcoin':{'sym':'BTC','tvSym':'BINANCE:BTCUSDT'},
  'ethereum':{'sym':'ETH','tvSym':'BINANCE:ETHUSDT'},
  'solana':{'sym':'SOL','tvSym':'BINANCE:SOLUSDT'},
  'ripple':{'sym':'XRP','tvSym':'BINANCE:XRPUSDT'},
  'dogecoin':{'sym':'DOGE','tvSym':'BINANCE:DOGEUSDT'},
  'cardano':{'sym':'ADA','tvSym':'BINANCE:ADAUSDT'},
  'avalanche-2':{'sym':'AVAX','tvSym':'BINANCE:AVAXUSDT'},
  'polkadot':{'sym':'DOT','tvSym':'BINANCE:DOTUSDT'},
  'chainlink':{'sym':'LINK','tvSym':'BINANCE:LINKUSDT'},
  'matic-network':{'sym':'MATIC','tvSym':'BINANCE:MATICUSDT'},
  'uniswap':{'sym':'UNI','tvSym':'BINANCE:UNIUSDT'},
  'litecoin':{'sym':'LTC','tvSym':'BINANCE:LTCUSDT'},
  'near':{'sym':'NEAR','tvSym':'BINANCE:NEARUSDT'},
  'aptos':{'sym':'APT','tvSym':'BINANCE:APTUSDT'},
  'arbitrum':{'sym':'ARB','tvSym':'BINANCE:ARBUSDT'},
  'cosmos':{'sym':'ATOM','tvSym':'BINANCE:ATOMUSDT'},
  'shiba-inu':{'sym':'SHIB','tvSym':'BINANCE:SHIBUSDT'},
  'tron':{'sym':'TRX','tvSym':'BINANCE:TRXUSDT'},
  'the-open-network':{'sym':'TON','tvSym':'BINANCE:TONUSDT'},
  'sui':{'sym':'SUI','tvSym':'BINANCE:SUIUSDT'},
  'pepe':{'sym':'PEPE','tvSym':'BINANCE:PEPEUSDT'},
  'bitcoin-cash':{'sym':'BCH','tvSym':'BINANCE:BCHUSDT'},
  'aave':{'sym':'AAVE','tvSym':'BINANCE:AAVEUSDT'},
  'maker':{'sym':'MKR','tvSym':'BINANCE:MKRUSDT'},
};

async function sf(url, t) {
  t = t || 8000;
  var ctrl = new AbortController();
  var id = setTimeout(function() { ctrl.abort(); }, t);
  try {
    var hdrs = (url.indexOf('coingecko') >= 0 && CG_KEY) ? {'x-cg-demo-api-key': CG_KEY} : {};
    var r = await fetch(url, {signal: ctrl.signal, headers: hdrs});
    clearTimeout(id);
    return r.ok ? await r.json() : null;
  } catch(e) { clearTimeout(id); return null; }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, {headers: CORS});
  var params = new URL(req.url).searchParams;
  var coinId = (params.get('id') || '').toLowerCase().trim();
  if (!coinId) return new Response(JSON.stringify({error:'No coin ID'}), {status:400, headers:CORS});

  var meta = META[coinId] || {
    sym: coinId.toUpperCase().slice(0, 6),
    tvSym: 'BINANCE:' + coinId.toUpperCase().replace(/-/g,'') + 'USDT',
  };

  var results = await Promise.all([
    sf('https://api.coingecko.com/api/v3/coins/' + coinId + '?localization=false&tickers=false&community_data=false&developer_data=false&sparkline=false'),
    sf('https://api.coingecko.com/api/v3/simple/price?ids=' + coinId + '&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true'),
  ]);

  var detail = results[0], price = results[1];
  var p = (price && price[coinId]) ? price[coinId] : {};
  var m = (detail && detail.market_data) ? detail.market_data : {};

  if (!p.usd && !m.current_price) {
    return new Response(JSON.stringify({error:'Not found'}), {status:404, headers:CORS});
  }

  return new Response(JSON.stringify({
    id: coinId,
    sym: meta.sym,
    name: detail ? detail.name : meta.sym,
    tvSym: meta.tvSym,
    image: detail ? detail.image : null,
    rank: detail ? detail.market_cap_rank : null,
    price: p.usd || (m.current_price && m.current_price.usd) || 0,
    chg24: p.usd_24h_change || m.price_change_percentage_24h || 0,
    chg7:  m.price_change_percentage_7d || null,
    chg30: m.price_change_percentage_30d || null,
    chg1y: m.price_change_percentage_1y || null,
    marketCap: p.usd_market_cap || (m.market_cap && m.market_cap.usd) || null,
    volume24:  p.usd_24h_vol  || (m.total_volume && m.total_volume.usd) || null,
    fdv: (m.fully_diluted_valuation && m.fully_diluted_valuation.usd) || null,
    circSupply:  m.circulating_supply || null,
    totalSupply: m.total_supply || null,
    maxSupply:   m.max_supply || null,
    ath:    (m.ath && m.ath.usd) || null,
    athChg: (m.ath_change_percentage && m.ath_change_percentage.usd) || null,
    athDate:(m.ath_date && m.ath_date.usd) || null,
    atl:    (m.atl && m.atl.usd) || null,
    atlChg: (m.atl_change_percentage && m.atl_change_percentage.usd) || null,
    atlDate:(m.atl_date && m.atl_date.usd) || null,
    sentiment_up: detail ? detail.sentiment_votes_up_percentage : null,
    sentiment_dn: detail ? detail.sentiment_votes_down_percentage : null,
    coingecko_score: detail ? detail.coingecko_score : null,
    description: (detail && detail.description) ? detail.description.en : null,
  }), {headers: CORS});
}
