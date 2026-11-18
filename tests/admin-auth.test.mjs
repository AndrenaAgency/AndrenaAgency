import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyAccessIdentity} from '../checkout-access-auth.js';
const env={ACCESS_TEAM_DOMAIN:'example.cloudflareaccess.com',ACCESS_AUD:'test-audience',ACCESS_ADMIN_EMAILS:'admin@example.com'};
const b64=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const token=payload=>[b64({alg:'RS256',kid:'test'}),b64(payload),'invalid-signature'].join('.');
const req=payload=>new Request('https://example.com/api/admin',{headers:{'Cf-Access-Jwt-Assertion':token(payload)}});
const base=()=>{const now=Math.floor(Date.now()/1000);return {iss:'https://example.cloudflareaccess.com',aud:['test-audience'],email:'admin@example.com',iat:now-30,exp:now+300}};
test('admin authentication rejects expired and future JWTs before key retrieval',async()=>{
 const expired={...base(),exp:Math.floor(Date.now()/1000)-1};
 const future={...base(),nbf:Math.floor(Date.now()/1000)+3600};
 const overlong={...base(),exp:Math.floor(Date.now()/1000)+90000};
 for(const payload of [expired,future,overlong])assert.equal(await verifyAccessIdentity(req(payload),env),null);
});
