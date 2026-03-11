// ── API BASE URL ──────────────────────────────────────────
// Za lokalni preview: promijeni u 'http://localhost:3000/api'
// Za produkciju:      ostavi 'https://api.pronadji.hr/api'
const API_BASE = 'https://api.pronadji.hr/api';

const api = {
  async _request(method, path, body) {
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(API_BASE + path, {
      method, headers, body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401) { localStorage.removeItem('token'); localStorage.removeItem('user'); window.location.href = 'login.html'; }
      throw new Error(data.error || `HTTP ${res.status}`);
    }
    return data;
  },
  get:    (path)       => api._request('GET',    path),
  post:   (path, body) => api._request('POST',   path, body),
  put:    (path, body) => api._request('PUT',    path, body),
  delete: (path)       => api._request('DELETE', path),
};

function requireAuth() {
  if (!localStorage.getItem('token')) window.location.href = 'login.html';
}
function requireActive() {
  requireAuth();
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  if (user.plan !== 'active') window.location.href = 'checkout.html';
}
function fmtPrice(p) { return p ? Number(p).toLocaleString('hr') + ' €' : '—'; }
function timeAgo(d) {
  if (!d) return '—';
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60) return 'Upravo';
  if (s < 3600) return `Prije ${Math.floor(s/60)} min`;
  if (s < 86400) return `Prije ${Math.floor(s/3600)} h`;
  return `Prije ${Math.floor(s/86400)} dana`;
}
function calcPrice(v) {
  v = parseInt(v);
  const elCount = document.getElementById('agentCount');
  const elTotal = document.getElementById('totalPrice');
  const elDisc  = document.getElementById('discBadge');
  const elRow   = document.getElementById('discRow');
  const elVal   = document.getElementById('discVal');
  if (elCount) elCount.textContent = v;
  const disc = v >= 4 ? 0.17 : 0;
  const pp = Math.round(50 * (1 - disc)), tot = v * pp;
  if (elTotal) elTotal.textContent = tot.toLocaleString('hr') + ' €';
  if (disc > 0) {
    if (elDisc) elDisc.classList.add('show');
    if (elRow) elRow.style.display = 'flex';
    if (elVal) elVal.textContent = '–' + Math.round(50 * 0.17 * v) + ' €';
  } else {
    if (elDisc) elDisc.classList.remove('show');
    if (elRow) elRow.style.display = 'none';
  }
}
