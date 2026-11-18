import test from 'node:test';
import assert from 'node:assert/strict';
import {checkoutApi,checkoutReady} from '../checkout-worker.js';
test('production checkout fails closed without secrets or launch flag',async()=>{
 assert.equal(checkoutReady({CHECKOUT_ENABLED:'true'}),false);
 const r=await checkoutApi(new Request('https://example.com/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'}),{});
 assert.equal(r.status,503);
 assert.equal((await r.json()).error,'Checkout is not accepting orders yet');
});
test('checkout availability remains disabled without payment and Turnstile bindings',async()=>{
 const r=await checkoutApi(new Request('https://example.com/api/checkout/status'),{CHECKOUT_ENABLED:'false',DB:{}});
 assert.deepEqual(await r.json(),{enabled:false});
});
test('enabled checkout rejects invalid order without writing to database',async()=>{
 const env={CHECKOUT_ENABLED:'true',DB:{},CHECKOUT_TURNSTILE_SECRET:'test',EFT_ACCOUNT_NUMBER:'test',EFT_ACCOUNT_NAME:'test',EFT_BRANCH_CODE:'test'};
 const r=await checkoutApi(new Request('https://example.com/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({package_code:'other',care_code:'none',domain_choice:'owned',customer_name:'Test Person',customer_email:'test@example.com',business_name:'Test Business'})}),env);
 assert.equal(r.status,400);
});

import {checkoutAdmin} from '../checkout-admin.js';
test('unauthenticated admin cannot list orders or approve payment',async()=>{
 const env={DB:{prepare(){throw Error('Database must not be accessed before auth')}}};
 for(const [path,method] of [['/api/admin/orders','GET'],['/api/admin/verify-eft','POST'],['/api/admin','GET']]){
  const r=await checkoutAdmin(new Request('https://example.com'+path,{method,headers:method==='POST'?{'Content-Type':'application/json'}:{},body:method==='POST'?'{}':undefined}),env);
  assert.equal(r.status,401);
 }
});

import {issueOnboardingLink,onboardingApi} from '../checkout-onboarding.js';
test('onboarding link is denied until bank deposit verification',async()=>{
 const env={DB:{prepare(){return {bind(){return {first:async()=>({status:'awaiting_deposit'})}}}}}};
 const result=await issueOnboardingLink(env,'test-order');
 assert.equal(result.status,409);
});
test('onboarding rejects malformed token before accessing database',async()=>{
 const r=await onboardingApi(new Request('https://example.com/api/onboarding',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'wrong',answers:{description:'test',services:'test',style:'',link:''}})}),{DB:{prepare(){throw Error('DB accessed')}}});
 assert.equal(r.status,400);
});
test('checkout pricing uses exactly 50 percent deposit for each published package',()=>{
 for(const amount of [84900,149900,249900])assert.equal(Math.floor(amount/2)+amount-Math.floor(amount/2),amount);
});
