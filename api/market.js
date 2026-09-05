export const config = { runtime: 'edge' };
const CORS = {'Access-Control-Allow-Origin':'*','Content-Type':'application/json','Cache-Control':'public, max-age=60'};
const CG_KEY = process.env.COINGECKO_API_KEY || '';

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, {headers:CORS});
  const {searchParams} = new URL(req.url);
  const ids = searchParams.get('ids') || 'bitcoin,ethereum,solana,ripple,dogecoin,cardano,avalanche-2,polkadot,chainlink,near,aptos,arbitrum';
  try {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${ids}&order=market_cap_desc&per_page=20&page=1&price_change_percentage=24h`,
      {headers: CG_KEY ? {'x-cg-demo-api-key': CG_KEY} : {}}
    );
    if (!r.ok) throw new Error('CoinGecko error ' + r.status);
    const data = await r.json();
    return new Response(JSON.stringify(data), {headers:CORS});
  } catch(e) {
    return new Response(JSON.stringify({error:e.message}), {status:500,headers:CORS});
  }
}