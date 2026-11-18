import {onboardingApi} from './checkout-onboarding.js';
import {checkoutAdmin} from './checkout-admin.js';
import {checkoutApi} from './checkout-worker.js';
const STOREFRONT='https://andrenaagency.andrenaagency.workers.dev';
export default {
 async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get('Origin');
  const isAdmin=url.pathname==='/api/admin'||url.pathname.startsWith('/api/admin/');
  const isOnboarding=url.pathname==='/onboarding'||url.pathname==='/api/onboarding';
  const allowedOrigin=isAdmin||isOnboarding?url.origin:STOREFRONT;
  if(origin&&origin!==allowedOrigin)return Response.json({error:'Forbidden origin'},{status:403,headers:{'Cache-Control':'no-store'}});
  const headers={'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin','Cache-Control':'no-store'};
  if(origin===allowedOrigin)headers['Access-Control-Allow-Origin']=allowedOrigin;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  const response=isOnboarding?await onboardingApi(request,env):isAdmin?await checkoutAdmin(request,env):await checkoutApi(request,env);
  const out=new Response(response.body,response);
  for(const [key,value] of Object.entries(headers))out.headers.set(key,value);
  return out;
 }
};
