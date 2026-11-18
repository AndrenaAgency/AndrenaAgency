const respond=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"}});
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
export async function issueOnboardingLink(env,orderId){
 const order=await env.DB.prepare("SELECT status FROM orders WHERE id=?").bind(orderId).first();
 if(!order||!['deposit_verified','awaiting_final_payment','ready_to_launch'].includes(order.status))return {error:'Deposit must be verified before onboarding',status:409};
 const token=crypto.randomUUID()+crypto.randomUUID(),digest=await hash(token);
 const update=await env.DB.prepare("UPDATE onboarding_access SET token_hash=?,revoked_at=NULL WHERE order_id=? AND revoked_at IS NOT NULL").bind(digest,orderId).run();
 if(update.meta.changes!==1)return {error:'Onboarding link already issued; contact administrator to rotate',status:409};
 await env.DB.prepare("UPDATE onboarding SET status='in_progress',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND status='not_started'").bind(orderId).run();
 return {url:'https://andrena-checkout.andrenaagency.workers.dev/onboarding#'+token};
}
export async function onboardingApi(request,env){
 const path=new URL(request.url).pathname;
 if(path==='/onboarding'&&request.method==='GET')return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Andrena | Project Brief</title><style>body{font:16px system-ui;max-width:650px;margin:35px auto;padding:18px}label{display:block;margin:16px 0}input,textarea{width:100%;box-sizing:border-box;padding:12px;font:inherit}button{padding:12px 24px;font:inherit}</style><h1>Website project brief</h1><p>Use the private link provided by Andrena after deposit verification. Please do not include passwords or payment details.</p><form id="brief"><label>Business description<textarea name="description" required maxlength="3000"></textarea></label><label>Services or products<textarea name="services" required maxlength="3000"></textarea></label><label>Preferred style and colors<textarea name="style" maxlength="1500"></textarea></label><label>Existing website or social link<input name="link" maxlength="500"></label><button>Submit brief</button></form><p id="status"></p><script>const token=location.hash.slice(1);history.replaceState(null,'',location.pathname);const form=document.getElementById('brief'),status=document.getElementById('status');if(!token){form.hidden=true;status.textContent='Missing onboarding access token. Request a new link from Andrena.'}form.onsubmit=async e=>{e.preventDefault();const answers=Object.fromEntries(new FormData(form));const button=form.querySelector('button');button.disabled=true;try{const r=await fetch('/api/onboarding',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,answers})});const data=await r.json();if(!r.ok)throw Error(data.error||'Unable to save');form.hidden=true;status.textContent='Your brief has been received. Andrena will review it.'}catch(err){status.textContent=err.message;button.disabled=false}};</script></html>`,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none"}});
 if(path!=='/api/onboarding'||request.method!=='POST')return respond({error:'Not found'},404);
 if(!request.headers.get('Content-Type')?.startsWith('application/json'))return respond({error:'JSON required'},415);
 if(Number(request.headers.get('Content-Length')||0)>12000)return respond({error:'Too large'},413);
 const b=await request.json().catch(()=>null);
 if(typeof b?.token!=='string'||!/^[0-9a-f-]{72}$/i.test(b.token)||!b.answers||typeof b.answers!=='object'||Array.isArray(b.answers))return respond({error:'Invalid brief'},400);
 const fields=['description','services','style','link'];const answers={};
 for(const k of fields){if(typeof b.answers[k]!=='string'||b.answers[k].length>({description:3000,services:3000,style:1500,link:500}[k]))return respond({error:'Invalid '+k},400);answers[k]=b.answers[k].trim()}
 if(answers.description.length<5||answers.services.length<5)return respond({error:'Describe your business and services'},400);
 const digest=await hash(b.token);
 const access=await env.DB.prepare("SELECT a.order_id FROM onboarding_access a JOIN orders o ON o.id=a.order_id WHERE a.token_hash=? AND a.revoked_at IS NULL AND o.status IN ('deposit_verified','awaiting_final_payment','ready_to_launch')").bind(digest).first();
 if(!access)return respond({error:'Link expired or not authorized'},403);
 const update=await env.DB.prepare("UPDATE onboarding SET answers_json=?,status='submitted',updated_at=CURRENT_TIMESTAMP WHERE order_id=? AND status IN ('not_started','in_progress')").bind(JSON.stringify(answers),access.order_id).run();
 if(update.meta.changes!==1)return respond({error:'Brief already submitted. Contact Andrena for changes.'},409);
 await env.DB.prepare("UPDATE onboarding_access SET revoked_at=CURRENT_TIMESTAMP WHERE order_id=? AND revoked_at IS NULL").bind(access.order_id).run();
 await env.DB.prepare("UPDATE projects SET status='brief_received',updated_at=CURRENT_TIMESTAMP WHERE order_id=?").bind(access.order_id).run();
 return respond({saved:true});
}
