export const config = { runtime: 'edge' };
const CORS = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json','Cache-Control':'public, max-age=120'};
const CG_KEY = process.env.COINGECKO_API_KEY || '';

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, {headers:CORS});
  const {searchParams} = new URL(req.url);
  const type = searchParams.get('type') || 'gainers'; // gainers | losers | trending
  try {
    if (type === 'trending') {
      const r = await fetch('https://api.coingecko.com/api/v3/search/trending',
        {headers: CG_KEY ? {'x-cg-demo-api-key': CG_KEY} : {}});
      if (!r.ok) throw new Error('CoinGecko error ' + r.status);
      const data = await r.json();
      const coins = (data.coins || []).slice(0, 12).map(c => ({
        id: c.item.id,
        name: c.item.name,
        symbol: c.item.symbol,
        image: c.item.small,
        current_price: c.item.data?.price || 0,
        price_change_percentage_24h: c.item.data?.price_change_percentage_24h?.usd || 0,
        market_cap: c.item.data?.market_cap || 0,
      }));
      return new Response(JSON.stringify(coins), {headers:CORS});
    }

    // Fetch top 100 coins for gainers/losers
    const r = await fetch(
      'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=100&page=1&price_change_percentage=24h',
      {headers: CG_KEY ? {'x-cg-demo-api-key': CG_KEY} : {}}
    );
    if (!r.ok) throw new Error('CoinGecko error ' + r.status);
    const all = await r.json();

    let result;
    if (type === 'gainers') {
      result = all
        .filter(c => c.price_change_percentage_24h > 0)
        .sort((a,b) => b.price_change_percentage_24h - a.price_change_percentage_24h)
        .slice(0, 12);
    } else {
      result = all
        .filter(c => c.price_change_percentage_24h < 0)
        .sort((a,b) => a.price_change_percentage_24h - b.price_change_percentage_24h)
        .slice(0, 12);
    }
    return new Response(JSON.stringify(result), {headers:CORS});
  } catch(e) {
    return new Response(JSON.stringify({error:e.message}), {status:500,headers:CORS});
  }
}
