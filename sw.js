/* OneSignal push (shares this service worker) */
try{importScripts('https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js');}catch(e){}
/* FlapShots offline support: page and icons cached; cards.json always fetched fresh, cached copy used offline. */
const V='flapshots-v36', CORE=['./','index.html','manifest.webmanifest','icon.svg','icon-192.png','icon-512.png','cards.json'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V&&k!=='badge-state').map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',e=>{
  const r=e.request; if(r.method!=='GET')return;
  const u=new URL(r.url);
  const same=u.origin===location.origin;
  const isData=u.pathname.endsWith('cards.json');
  const isPage=r.mode==='navigate'||(same&&u.pathname.endsWith('index.html'));
  if(isData||isPage){
    e.respondWith(fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(V).then(c=>c.put(isData?'cards.json':'index.html',cp));}return res;}).catch(()=>caches.match(isData?'cards.json':'index.html')));
    return;
  }
  if(same||u.hostname.endsWith('gstatic.com')||u.hostname.endsWith('googleapis.com')){
    e.respondWith(caches.match(r).then(hit=>hit||fetch(r).then(res=>{if(res.ok){const cp=res.clone();caches.open(V).then(c=>c.put(r,cp));}return res;})));
  }
});

/* App-icon badge: cards left for today's goal plus yesterday's shortfall, capped by unread cards in the latest cards.json. */
const dayKey=(b=0)=>new Date(Date.now()+5.5*3600e3-b*864e5).toISOString().slice(0,10);
async function refreshBadge(){
  try{
    if(!('setAppBadge' in self.navigator))return;
    const r=await (await caches.open('badge-state')).match('badge-state.json'); if(!r)return;
    const st=await r.json(); if(st.off){await self.navigator.clearAppBadge();return;}
    const res=await fetch('cards.json?t='+Date.now(),{cache:'no-store'}); if(!res.ok)return;
    const cp=res.clone(); caches.open(V).then(c=>c.put('cards.json',cp)).catch(()=>{});
    const j=await res.json(), arr=Array.isArray(j)?j:(j.cards||[]);
    const seen=new Set(st.seen||[]), hid=new Set(st.hidden||[]);
    const ok=d=>d&&d.id&&typeof d.head==='string'&&typeof d.take==='string'&&typeof d.u==='string'&&/^https:\/\//.test(d.u)&&typeof d.cat==='string';
    let n=(st.lib||0)+arr.filter(ok).map(d=>'db-'+d.id).filter(id=>!seen.has(id)&&!hid.has(id)).length;
    const g=st.goal||20, dd=st.days||{}, due=Math.max(0,g+Math.max(0,g-(dd[dayKey(1)]||0))-(dd[dayKey()]||0));
    n=Math.min(n,due,st.max||99);
    if(n)await self.navigator.setAppBadge(n); else await self.navigator.clearAppBadge();
  }catch(e){}
}
self.addEventListener('push',e=>{e.waitUntil(refreshBadge());});
self.addEventListener('periodicsync',e=>{if(e.tag==='badge')e.waitUntil(refreshBadge());});
