export const config = { runtime: 'edge' };
const CORS = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json','Cache-Control':'public, max-age=300'};
const CG_KEY = process.env.COINGECKO_API_KEY || '';

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, {headers:CORS});
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/global', {
      headers: CG_KEY ? {'x-cg-demo-api-key': CG_KEY} : {}
    });
    if (!r.ok) throw new Error('CoinGecko error');
    const d = await r.json();
    const g = d.data;
    return new Response(JSON.stringify({
      total_market_cap_usd:  g.total_market_cap?.usd,
      total_volume_usd:      g.total_volume?.usd,
      btc_dominance:         g.market_cap_percentage?.btc,
      eth_dominance:         g.market_cap_percentage?.eth,
      active_coins:          g.active_cryptocurrencies,
      markets:               g.markets,
      market_cap_change_24h: g.market_cap_change_percentage_24h_usd,
    }), {headers:CORS});
  } catch(e) {
    return new Response(JSON.stringify({error:e.message}), {status:500,headers:CORS});
  }
}