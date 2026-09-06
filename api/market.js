export const config = { runtime: 'edge' };
const CORS = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json','Cache-Control':'public, max-age=60'};
const CG_KEY = process.env.COINGECKO_API_KEY || '';

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, {headers:CORS});
  var ids = 'bitcoin,ethereum,solana,ripple,dogecoin,cardano,avalanche-2,polkadot,chainlink,near,aptos,arbitrum';
  try {
    var hdrs = CG_KEY ? {'x-cg-demo-api-key': CG_KEY} : {};
    var url = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=' + ids + '&order=market_cap_desc&per_page=20&page=1&price_change_percentage=24h';
    var r = await fetch(url, {headers: hdrs});
    if (!r.ok) throw new Error('CoinGecko error ' + r.status);
    var data = await r.json();
    return new Response(JSON.stringify(data), {headers: CORS});
  } catch(e) {
    return new Response(JSON.stringify({error: e.message}), {status:500, headers:CORS});
  }
}
