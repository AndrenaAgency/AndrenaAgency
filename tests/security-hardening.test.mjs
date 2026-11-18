import test from 'node:test';
import assert from 'node:assert/strict';
import entry from '../checkout-api-entry.js';
import {checkoutApi} from '../checkout-worker.js';
import {onboardingApi} from '../checkout-onboarding.js';
const base='https://andrena-checkout.andrenaagency.workers.dev';
const storefront='https://andrenaagency.andrenaagency.workers.dev';
const env=(db={prepare(){throw Error('Unexpected DB call')}})=>({CHECKOUT_ENABLED:'true',DB:db,CHECKOUT_TURNSTILE_SECRET:'test',EFT_ACCOUNT_NUMBER:'TEST',EFT_ACCOUNT_NAME:'TEST',EFT_BRANCH_CODE:'TEST'});
const order=(patch={})=>({package_code:'starter',care_code:'none',domain_choice:'owned',customer_name:'Example Customer',customer_email:'example@example.test',business_name:'Example Business',accepted_terms:true,turnstile_token:'fake-token-123456',...patch});
const post=(body,headers={'Content-Type':'application/json'})=>new Request(base+'/api/checkout',{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)});
test('CORS only allows the configured storefront origin',async()=>{
 const good=await entry.fetch(new Request(base+'/api/checkout/status',{headers:{Origin:storefront}}),{});
 assert.equal(good.headers.get('Access-Control-Allow-Origin'),storefront);
 const bad=await entry.fetch(new Request(base+'/api/checkout/status',{headers:{Origin:'https://evil.example'}}),{});
 assert.equal(bad.status,403);
 assert.equal(bad.headers.get('Access-Control-Allow-Origin'),null);
});
test('preflight does not permit an unauthorized origin',async()=>{
 const r=await entry.fetch(new Request(base+'/api/checkout',{method:'OPTIONS',headers:{Origin:'https://evil.example','Access-Control-Request-Method':'POST'}}),{});
 assert.equal(r.status,403);
});
test('checkout rejects invalid JSON and unsupported content type',async()=>{
 assert.equal((await checkoutApi(post('{not-json'),env())).status,400);
 assert.equal((await checkoutApi(post('{}',{'Content-Type':'text/plain'}),env())).status,415);
});
test('checkout rejects invalid package, missing consent and malformed token before writing',async()=>{
 for(const payload of [order({package_code:'fake'}),order({accepted_terms:false}),order({turnstile_token:'short'})]){
  const r=await checkoutApi(post(payload),env());assert.equal(r.status,400);
 }
});
test('checkout rate limits repeat orders before Turnstile validation',async()=>{
 const db={prepare(){return {bind(){return {first:async()=>({count:3})}}}}};
 const r=await checkoutApi(post(order()),env(db));assert.equal(r.status,429);
});
test('Turnstile hostname mismatch fails closed and creates no order',async()=>{
 const db={prepare(){return {bind(){return {first:async()=>({count:0})}}}}};
 const original=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({success:true,action:'checkout',hostname:'untrusted.example'});
 try{const r=await checkoutApi(post(order()),env(db));assert.equal(r.status,403)}finally{globalThis.fetch=original}
});
test('onboarding denies malformed JSON and unsupported content type',async()=>{
 const url=base+'/api/onboarding';
 const bad=await onboardingApi(new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{' }),{});
 assert.equal(bad.status,400);
 const wrong=await onboardingApi(new Request(url,{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'}),{});
 assert.equal(wrong.status,415);
});
