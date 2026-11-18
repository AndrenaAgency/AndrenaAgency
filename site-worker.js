import html from './index.html';
const headers={
 'Content-Type':'text/html; charset=utf-8',
 'X-Content-Type-Options':'nosniff',
 'X-Frame-Options':'DENY',
 'Referrer-Policy':'strict-origin-when-cross-origin',
 'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
 'Cache-Control':'no-cache'
};
export default {
 async fetch(request){
  const u=new URL(request.url);
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method Not Allowed',{status:405,headers:{Allow:'GET, HEAD'}});
  if(u.pathname!=='/'&&u.pathname!=='/index.html')return new Response('Not Found',{status:404,headers:{'X-Content-Type-Options':'nosniff'}});
  return new Response(request.method==='HEAD'?null:html,{headers});
 }
};
