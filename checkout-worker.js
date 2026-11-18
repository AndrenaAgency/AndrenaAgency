// Andrena production checkout API. Fail closed until all required bindings are configured.
const PRICES={starter:84900,standard:149900,premium:249900};
const CARES=new Set(["none","starter","business","premium"]);
const DOMAINS=new Set(["quote","owned","later"]);
const reply=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"}});
const clean=(v,n)=>typeof v==="string"?v.trim().slice(0,n):"";
const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,"0")).join("");
export function checkoutReady(env){return env.CHECKOUT_ENABLED==="true"&&!!env.DB&&!!env.CHECKOUT_TURNSTILE_SECRET&&!!env.EFT_ACCOUNT_NUMBER&&!!env.EFT_ACCOUNT_NAME&&!!env.EFT_BRANCH_CODE}
export async function checkoutApi(request,env){
 const url=new URL(request.url);
 if(url.pathname==="/api/checkout/status"&&request.method==="GET")return reply({enabled:checkoutReady(env)});
 if(url.pathname!=="/api/checkout"||request.method!=="POST")return reply({error:"Not found"},404);
 if(!checkoutReady(env))return reply({error:"Checkout is not accepting orders yet"},503);
 if(!request.headers.get("Content-Type")?.startsWith("application/json"))return reply({error:"JSON required"},415);
 if(Number(request.headers.get("Content-Length")||0)>8192)return reply({error:"Request too large"},413);
 const raw=await request.text().catch(()=>null);
 if(raw===null||new TextEncoder().encode(raw).byteLength>8192)return reply({error:"Request too large"},413);
 const b=(()=>{try{return JSON.parse(raw)}catch{return null}})();
 if(!b||typeof b!=="object"||Array.isArray(b))return reply({error:"Invalid order"},400);
 const limits={package_code:30,care_code:30,domain_choice:30,customer_name:120,customer_email:254,business_name:120};
 for(const [key,max] of Object.entries(limits)){if(typeof b[key]!=='string'||b[key].length>max)return reply({error:'Invalid or oversized '+key},400)}
 const pkg=clean(b.package_code,30),care=clean(b.care_code,30),domain=clean(b.domain_choice,30);
 const name=clean(b.customer_name,120),email=clean(b.customer_email,254).toLowerCase();
 const business=clean(b.business_name,120);
 if(!Object.hasOwn(PRICES,pkg)||!CARES.has(care)||!DOMAINS.has(domain))return reply({error:"Invalid package selection"},400);
 if(b.accepted_terms!==true)return reply({error:"Accept the terms before placing an order"},400);
 if(name.length<2||business.length<2||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply({error:"Valid customer and business details required"},400);
 if(typeof b.turnstile_token!=="string"||b.turnstile_token.length<10||b.turnstile_token.length>2048)return reply({error:"Complete the security check"},400);
 const recent=await env.DB.prepare("SELECT COUNT(*) AS count FROM orders WHERE customer_email=? AND created_at>datetime('now','-1 day')").bind(email).first();
 if((recent?.count||0)>=3)return reply({error:"Too many recent orders for this email. Contact Andrena for assistance."},429);
 const form=new FormData();form.set("secret",env.CHECKOUT_TURNSTILE_SECRET);form.set("response",b.turnstile_token);
 const ip=request.headers.get("CF-Connecting-IP");if(ip)form.set("remoteip",ip);
 const verified=await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify",{method:"POST",body:form}).then(r=>r.json()).catch(()=>null);
 if(!verified?.success||verified.action!=="checkout"||verified.hostname!=="andrenaagency.andrenaagency.workers.dev")return reply({error:"Security verification failed"},403);
 const id=crypto.randomUUID(),total=PRICES[pkg],deposit=Math.floor(total/2),balance=total-deposit;
 const reference="AND-"+id.replaceAll("-","").slice(0,12).toUpperCase()+"-D";
 const accessHash=await sha(crypto.randomUUID());
 try{
  await env.DB.batch([
   env.DB.prepare("INSERT INTO orders(id,customer_name,customer_email,package_code,care_code,domain_choice,total_cents,deposit_cents,balance_cents,status) VALUES(?,?,?,?,?,?,?,?,?,'awaiting_deposit')").bind(id,name,email,pkg,care,domain,total,deposit,balance),
   env.DB.prepare("INSERT INTO onboarding(id,order_id,status,answers_json,missing_items_json,current_section) VALUES(?,?,'not_started',?,'[]',1)").bind(crypto.randomUUID(),id,JSON.stringify({business_name:business})),
   env.DB.prepare("INSERT INTO projects(id,order_id,status) VALUES(?,?,'awaiting_brief')").bind(crypto.randomUUID(),id),
   env.DB.prepare("INSERT INTO onboarding_access(order_id,token_hash,revoked_at) VALUES(?,?,CURRENT_TIMESTAMP)").bind(id,accessHash),
   env.DB.prepare("INSERT INTO eft_payment_requests(id,order_id,installment,reference,amount_cents) VALUES(?,?,'deposit',?,?)").bind(crypto.randomUUID(),id,reference,deposit),
   env.DB.prepare("INSERT INTO activity_log(id,order_id,event_type,actor_type,description) VALUES(?,?,'order_created','customer','Customer requested website checkout')").bind(crypto.randomUUID(),id)
  ]);
 }catch{return reply({error:"Could not create order. Please contact Andrena."},500)}
 return reply({order_id:id,package_code:pkg,total_cents:total,deposit_cents:deposit,balance_cents:balance,instructions:{bank_name:"Capitec",account_name:env.EFT_ACCOUNT_NAME,account_number:env.EFT_ACCOUNT_NUMBER,branch_code:env.EFT_BRANCH_CODE,reference,amount_cents:deposit},note:"Use the exact reference. Work and onboarding begin only after cleared funds are verified by Andrena."},201);
}
