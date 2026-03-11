// dashboard.js — puna logika dashboarda, spojena na API

requireActive();

// ── STATE ─────────────────────────────────────────────────
let currentPage  = 1;
let totalPages   = 1;
let activeFilter = 'all';
let currentView  = 'listings';
let autoRefreshInterval = null;

// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadUser();
  loadStats();
  loadListings();
  loadNotifications();
  checkMobileNav();
  handlePaymentReturn();
  // Auto-refresh svakih 60s
  autoRefreshInterval = setInterval(() => {
    if (currentView === 'listings') loadListings(false);
    loadStats();
  }, 60000);
});

// ── USER INFO ─────────────────────────────────────────────
function loadUser() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const initials = (user.full_name || user.email || 'U')
    .split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  document.getElementById('userAva').textContent  = initials;
  document.getElementById('userName').textContent  = user.full_name || user.email || '—';
  const firstName = (user.full_name || '').split(' ')[0] || 'tamo';
  document.getElementById('pageSub').textContent  = `Učitavanje podataka...`;
}

// ── STATS ─────────────────────────────────────────────────
async function loadStats() {
  try {
    const s = await api.get('/listings/stats/summary');
    document.getElementById('statToday').textContent   = s.today   ?? '—';
    document.getElementById('statPrivate').textContent = s.private ?? '—';
    document.getElementById('statDropped').textContent = s.dropped ?? '—';
    document.getElementById('todayCount').textContent  = s.today   ?? '—';
    document.getElementById('pageSub').textContent = `Danas je objavljeno ${s.today} novih oglasa prema tvojim filtrima.`;
  } catch (e) {
    console.warn('Stats error:', e.message);
  }
}

// ── LISTINGS ──────────────────────────────────────────────
async function loadListings(showLoading = true) {
  const container = document.getElementById('dashListings');
  if (showLoading) container.innerHTML = '<div class="loading-row">Učitavanje oglasa...</div>';

  const params = buildParams();
  try {
    const data = await api.get(`/listings?${params}`);
    totalPages = data.total_pages;
    renderListings(data.listings, data.total);
    updatePagination(data.page, data.total_pages, data.total);
    document.getElementById('lastUpdated').textContent = 'Ažurirano: ' + new Date().toLocaleTimeString('hr');
  } catch (e) {
    container.innerHTML = `<div class="empty-row">Greška pri učitavanju: ${e.message}</div>`;
  }
}

function buildParams() {
  const p = new URLSearchParams();
  p.set('page', currentPage);
  p.set('limit', 25);

  const city   = document.getElementById('filterCity')?.value;
  const type   = document.getElementById('filterType')?.value;
  const source = document.getElementById('filterSource')?.value;
  const agency = document.getElementById('agencyToggle')?.checked;

  if (city)   p.set('city', city);
  if (type)   p.set('property_type', type);
  if (source) p.set('source', source);
  if (agency) p.set('show_agency', 'true');

  if (activeFilter === 'private') p.set('is_new', 'false'); // override below
  if (activeFilter === 'private') { /* show_agency already false by default */ }
  if (activeFilter === 'new')     p.set('is_new', 'true');
  if (activeFilter === 'dropped') p.set('price_dropped', 'true');

  return p.toString();
}

function renderListings(listings, total) {
  const c = document.getElementById('dashListings');
  if (!listings.length) {
    c.innerHTML = '<div class="empty-row">Nema oglasa prema zadanim filterima.</div>';
    return;
  }
  c.innerHTML = '';
  listings.forEach(l => {
    const row = document.createElement('div');
    row.className = 'lrow' + (l.is_new ? ' lnew' : '');
    row.onclick = () => window.open(l.url, '_blank');

    const srcClass = { njuskalo:'fc-n', index:'fc-i', plavi:'fc-p', cackaloo:'fc-c' }[l.source] || '';
    const ppsm = l.price_per_sqm ? `<span style="font-size:10px;color:var(--soft);display:block">${Math.round(l.price_per_sqm).toLocaleString('hr')} €/m²</span>` : '';
    const areaAvg = l.area_avg_price_per_sqm && l.price_per_sqm
      ? (l.price_per_sqm < l.area_avg_price_per_sqm
          ? '<span class="tag tag-n" style="font-size:9px">Ispod prosjeka</span>'
          : '')
      : '';

    row.innerHTML = `
      <div>
        <div class="lt">
          ${l.title}
          ${l.is_private   ? '<span class="tag tag-p">Privatni</span>' : ''}
          ${!l.is_private  ? '<span class="tag tag-a">Agencija</span>' : ''}
          ${l.is_new       ? '<span class="tag tag-n">Novo</span>' : ''}
          ${l.price_dropped ? '<span class="tag tag-d">📉 Sniženo</span>' : ''}
          ${areaAvg}
        </div>
        <div class="lm">${[l.size_sqm ? l.size_sqm + ' m²' : null, l.city, l.floor ? l.floor + '. kat' : null].filter(Boolean).join(' · ')}</div>
      </div>
      <div class="lsrc ${srcClass}">${l.source}</div>
      <div class="lp">${fmtPrice(l.price)}${ppsm}</div>
      <div class="ltime">${timeAgo(l.scraped_at)}</div>
    `;
    c.appendChild(row);
  });
}

function updatePagination(page, total, totalItems) {
  const el = document.getElementById('pagination');
  if (total <= 1) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  document.getElementById('pageInfo').textContent = `Stranica ${page} od ${total} (${totalItems} oglasa)`;
  document.getElementById('prevPage').disabled = page <= 1;
  document.getElementById('nextPage').disabled = page >= total;
}

function changePage(dir) {
  currentPage = Math.max(1, Math.min(totalPages, currentPage + dir));
  loadListings();
}

function refreshListings() {
  currentPage = 1;
  loadListings();
}

// ── FILTER BUTTONS ────────────────────────────────────────
function dfOn(el) {
  document.querySelectorAll('.df').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
  activeFilter = el.dataset.filter;
  currentPage = 1;
  loadListings();
}

// ── NOTIFICATIONS ─────────────────────────────────────────
async function loadNotifications() {
  // Prikazujemo demo notifikacije (u produkciji: WebSocket ili polling)
  const items = [
    { type:'g', text:'Novi privatni oglas u Rijeci — Stan 58m², 185.000 €', time:'Upravo' },
    { type:'b', text:'Cijena snižena — Kuća Trnje s 380.000 € na 355.000 €', time:'Prije 14 min' },
    { type:'g', text:'5 novih oglasa — filter "Split stanovi do 250k"', time:'Prije 31 min' },
    { type:'o', text:'Oglas maknut — Garsonjera Maksimir (prodano?)', time:'Prije 1 sat' },
    { type:'b', text:'Novi oglas odgovara filteru "Dubrovnik vile"', time:'Prije 2 sata' },
  ];
  renderNotifications('notifList', items);
  renderNotifications('allNotifList', items);
  if (items.length) document.getElementById('notifBadge').style.display = 'inline';
}

function renderNotifications(containerId, items) {
  const c = document.getElementById(containerId);
  if (!c) return;
  c.innerHTML = items.map(n => `
    <div class="notif">
      <div class="nd nd-${n.type}"></div>
      <div><div class="nt">${n.text}</div><div class="ntime">${n.time}</div></div>
    </div>
  `).join('');
}

// ── VIEW SWITCHING ────────────────────────────────────────
function setView(view, el) {
  currentView = view;
  document.querySelectorAll('.ni').forEach(i => i.classList.remove('on'));
  if (el) el.classList.add('on');

  const views = ['listings','filters','pricedrops','stats','notifications'];
  views.forEach(v => {
    const el2 = document.getElementById('view-' + v);
    if (el2) el2.style.display = v === view ? 'block' : 'none';
  });

  const titles = {
    listings:      ['Oglasi',          'Novi privatni oglasi prema tvojim filtrima'],
    filters:       ['Moji filtri',      'Upravljaj filterima pretraživanja'],
    pricedrops:    ['Sniženja cijene',  'Oglasi kojima je smanjena cijena'],
    stats:         ['Statistike',       'Analitika tržišta i trendovi'],
    notifications: ['Obavijesti',       'Sve obavijesti'],
  };
  const [title, sub] = titles[view] || ['—', ''];
  document.getElementById('pageTitle').textContent = title;
  document.getElementById('pageSub').textContent   = sub;
  document.getElementById('newFilterBtn').style.display = view === 'listings' || view === 'filters' ? 'flex' : 'none';

  closeSb();

  if (view === 'filters') loadFilters();
  if (view === 'pricedrops') loadPriceDrops();
}

// ── FILTERS CRUD ──────────────────────────────────────────
async function loadFilters() {
  const c = document.getElementById('filtersList');
  c.innerHTML = '<div class="loading-row">Učitavanje filtara...</div>';
  try {
    const filters = await api.get('/filters');
    if (!filters.length) {
      c.innerHTML = '<div class="empty-row">Nemaš još niti jedan filter. Kreiraj prvi!</div>';
      return;
    }
    c.innerHTML = filters.map(f => `
      <div class="filter-item">
        <div>
          <div class="fi-name">${f.name}</div>
          <div class="fi-meta">
            ${f.property_types?.join(', ') || 'Svi tipovi'} ·
            ${f.locations?.length ? f.locations.join(', ') : 'Sve lokacije'} ·
            ${f.price_min || f.price_max ? `${f.price_min ? fmtPrice(f.price_min) : '0 €'} – ${f.price_max ? fmtPrice(f.price_max) : '∞'}` : 'Sve cijene'} ·
            ${f.show_agency ? 'Svi oglasi' : 'Samo privatni'}
          </div>
        </div>
        <div class="fi-actions">
          <button class="btn btn-outline btn-sm" onclick="editFilter(${JSON.stringify(f).replace(/"/g,'&quot;')})">Uredi</button>
          <button class="btn btn-danger btn-sm" onclick="deleteFilter(${f.id})">Obriši</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    c.innerHTML = `<div class="empty-row">Greška: ${e.message}</div>`;
  }
}

async function deleteFilter(id) {
  if (!confirm('Obrisati ovaj filter?')) return;
  try {
    await api.delete(`/filters/${id}`);
    loadFilters();
  } catch (e) { alert('Greška: ' + e.message); }
}

function editFilter(f) {
  openFilterModal();
  document.getElementById('editFilterId').value = f.id;
  document.getElementById('modalTitle').textContent = 'Uredi filter';
  document.getElementById('fName').value = f.name || '';
  document.getElementById('fPriceMin').value = f.price_min || '';
  document.getElementById('fPriceMax').value = f.price_max || '';
  document.getElementById('fSizeMin').value  = f.size_min  || '';
  document.getElementById('fSizeMax').value  = f.size_max  || '';
  document.getElementById('fAgency').checked = f.show_agency || false;
  document.getElementById('fNotify').checked = f.notify_email !== false;

  // Chips
  document.querySelectorAll('#fTypes .chip').forEach(c => {
    c.classList.toggle('on', (f.property_types || []).includes(c.dataset.val));
  });
  document.querySelectorAll('#fSources .srchip').forEach(c => {
    const cls = 'on-' + { njuskalo:'n', index:'i', plavi:'p', cackaloo:'c' }[c.dataset.val];
    c.classList.toggle(cls, (f.sources || []).includes(c.dataset.val));
  });
}

function openFilterModal() {
  document.getElementById('editFilterId').value = '';
  document.getElementById('modalTitle').textContent = 'Novi filter';
  document.getElementById('fName').value = '';
  document.getElementById('fPriceMin').value = '';
  document.getElementById('fPriceMax').value = '';
  document.getElementById('fSizeMin').value  = '';
  document.getElementById('fSizeMax').value  = '';
  document.getElementById('fAgency').checked = false;
  document.getElementById('fNotify').checked = true;
  document.querySelectorAll('#fTypes .chip').forEach((c, i) => c.classList.toggle('on', i === 0));
  document.querySelectorAll('#fSources .srchip').forEach(c => {
    const m = { njuskalo:'on-n', index:'on-i', plavi:'on-p', cackaloo:'on-c' };
    c.className = 'srchip ' + (m[c.dataset.val] || '');
  });
  document.getElementById('filterModal').style.display = 'flex';
}

function closeFilterModal() { document.getElementById('filterModal').style.display = 'none'; }

async function saveFilter() {
  const id   = document.getElementById('editFilterId').value;
  const name = document.getElementById('fName').value.trim() || 'Moj filter';
  const property_types = [...document.querySelectorAll('#fTypes .chip.on')].map(c => c.dataset.val);
  const sources = [...document.querySelectorAll('#fSources .srchip')].filter(c => {
    const m = { njuskalo:'on-n', index:'on-i', plavi:'on-p', cackaloo:'on-c' };
    return c.classList.contains(m[c.dataset.val]);
  }).map(c => c.dataset.val);

  const payload = {
    name,
    property_types: property_types.length ? property_types : ['stan'],
    sources:        sources.length ? sources : ['njuskalo','index','plavi','cackaloo'],
    price_min:  parseInt(document.getElementById('fPriceMin').value) || null,
    price_max:  parseInt(document.getElementById('fPriceMax').value) || null,
    size_min:   parseInt(document.getElementById('fSizeMin').value)  || null,
    size_max:   parseInt(document.getElementById('fSizeMax').value)  || null,
    show_agency:  document.getElementById('fAgency').checked,
    notify_email: document.getElementById('fNotify').checked,
  };

  const btn = document.getElementById('saveFilterBtn');
  btn.disabled = true; btn.textContent = 'Spremanje...';

  try {
    if (id) await api.put(`/filters/${id}`, payload);
    else    await api.post('/filters', payload);
    closeFilterModal();
    if (currentView === 'filters') loadFilters();
  } catch (e) {
    alert('Greška: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Spremi filter';
  }
}

function toggleChip(el) { el.classList.toggle('on'); }
function toggleSrcChip(el, cls) { el.classList.toggle(cls); }

// ── PRICE DROPS ───────────────────────────────────────────
async function loadPriceDrops() {
  const c = document.getElementById('priceDropsList');
  c.innerHTML = '<div class="loading-row">Učitavanje...</div>';
  try {
    const data = await api.get('/listings?price_dropped=true&show_agency=false&limit=30');
    if (!data.listings.length) {
      c.innerHTML = '<div class="empty-row">Nema sniženja u zadnje vrijeme.</div>';
      return;
    }
    c.innerHTML = '';
    data.listings.forEach(l => {
      const row = document.createElement('div');
      row.className = 'lrow lnew';
      row.onclick = () => window.open(l.url, '_blank');
      const hist = (l.price_history || []);
      const oldPrice = hist.length ? hist[hist.length - 1].price : null;
      const diff = oldPrice ? oldPrice - l.price : null;
      row.innerHTML = `
        <div>
          <div class="lt">${l.title} <span class="tag tag-d">📉 Sniženo</span></div>
          <div class="lm">${l.city || ''} · ${l.source}${diff ? ` · Sniženo za ${fmtPrice(diff)}` : ''}</div>
        </div>
        <div class="lsrc">—</div>
        <div class="lp">${fmtPrice(l.price)}${oldPrice ? `<span style="font-size:10px;color:var(--soft);text-decoration:line-through;display:block">${fmtPrice(oldPrice)}</span>` : ''}</div>
        <div class="ltime">${timeAgo(l.price_dropped_at)}</div>
      `;
      c.appendChild(row);
    });
  } catch (e) {
    c.innerHTML = `<div class="empty-row">Greška: ${e.message}</div>`;
  }
}

// ── BILLING ───────────────────────────────────────────────
async function openBillingPortal() {
  try {
    const data = await api.post('/billing/portal', {});
    window.location.href = data.url;
  } catch (e) { alert('Greška: ' + e.message); }
}

// ── LOGOUT ────────────────────────────────────────────────
function handleLogout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  window.location.href = 'index.html';
}

// ── PAYMENT RETURN ────────────────────────────────────────
function handlePaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('payment') === 'success') {
    // Refresh user data
    api.get('/auth/me').then(u => {
      localStorage.setItem('user', JSON.stringify(u));
    }).catch(() => {});
    // Makni param iz URL-a
    window.history.replaceState({}, '', 'dashboard.html');
  }
}

// ── SIDEBAR MOBILE ────────────────────────────────────────
function checkMobileNav() { document.getElementById('sbTog').style.display = window.innerWidth < 768 ? 'flex' : 'none'; }
function toggleSb() { document.getElementById('dsb').classList.toggle('open'); document.getElementById('sbOv').classList.toggle('open'); }
function closeSb()  { document.getElementById('dsb').classList.remove('open'); document.getElementById('sbOv').classList.remove('open'); }
window.addEventListener('resize', checkMobileNav);
