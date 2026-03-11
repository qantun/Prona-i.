if (localStorage.getItem('token')) {
  const u = JSON.parse(localStorage.getItem('user') || '{}');
  if (u.plan === 'active') window.location.href = 'dashboard.html';
}
function toggleMob() { document.getElementById('mobMenu').classList.toggle('open'); }
function closeMob()  { document.getElementById('mobMenu').classList.remove('open'); }
const feedData = [
  {src:'Njuškalo',sc:'fc-n',title:'Stan 3S, Novi Zagreb — Sopnica',pvt:true,price:'275.000 €',loc:'Zagreb'},
  {src:'Index',sc:'fc-i',title:'Dvosoban stan, Pula centar',pvt:true,price:'195.000 €',loc:'Pula'},
  {src:'Plavi',sc:'fc-p',title:'Kuća 140m², vrt, Varaždin',pvt:true,price:'210.000 €',loc:'Varaždin'},
  {src:'Čačkalo',sc:'fc-c',title:'Penthouse 120m², Split — Meje',pvt:false,price:'650.000 €',loc:'Split'},
  {src:'Njuškalo',sc:'fc-n',title:'Garsonjera 27m², Zadar centar',pvt:true,price:'129.000 €',loc:'Zadar'},
];
let fi = 0;
setInterval(() => {
  const feed = document.getElementById('liveFeed'); if (!feed) return;
  const d = feedData[fi++ % feedData.length];
  const r = document.createElement('div');
  r.className = 'feed-row f-new';
  r.style.cssText = 'opacity:0;transform:translateY(-7px);transition:all .33s';
  r.innerHTML = `<span class="f-src ${d.sc}">${d.src}</span><div><div class="f-title">${d.title} <span class="tag ${d.pvt?'tag-p':'tag-n'}">${d.pvt?'Privatni':'Novo'}</span></div><div class="f-loc">📍 ${d.loc}</div></div><div class="f-price">${d.price}</div><div class="f-time">Upravo</div>`;
  feed.insertBefore(r, feed.firstChild);
  requestAnimationFrame(() => { r.style.opacity='1'; r.style.transform='translateY(0)'; });
  if (feed.children.length > 5) { const last=feed.lastChild; last.style.opacity='0'; setTimeout(()=>last.remove(),340); }
  const times=['Prije 1 min','Prije 4 min','Prije 9 min','Prije 16 min','Prije 25 min'];
  [...feed.querySelectorAll('.f-time')].forEach((t,i)=>{ if(i>0) t.textContent=times[i]||'30+ min'; });
}, 4800);
const io = new IntersectionObserver(entries => {
  entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('vis'); io.unobserve(e.target); } });
}, { threshold:.08 });
document.querySelectorAll('.rv').forEach((el,i) => { el.style.transitionDelay=(i%3)*.08+'s'; io.observe(el); });
