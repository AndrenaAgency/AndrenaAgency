import {checkoutAdmin} from './checkout-admin.js';
import {checkoutApi} from './checkout-worker.js';
const ORIGIN='https://andrenaagency.andrenaagency.workers.dev';
export default {
 async fetch(request,env){
  const origin=request.headers.get('Origin');
  const headers={'Access-Control-Allow-Origin':ORIGIN,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin','Cache-Control':'no-store'};
  if(origin&&origin!==ORIGIN)return Response.json({error:'Forbidden origin'},{status:403});
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  const response=(new URL(request.url).pathname==='/api/admin'||new URL(request.url).pathname.startsWith('/api/admin/'))?await checkoutAdmin(request,env):await checkoutApi(request,env);
  const out=new Response(response.body,response);
  for(const [key,value] of Object.entries(headers))out.headers.set(key,value);
  return out;
 }
};