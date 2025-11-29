// admin.js — логика для admin.html
// пример API запроса
const API_URL = 'https://vorhitalone-generatornumbers-46cd.twc1.net';

// Пример запроса
export const getData = async () => {
  try {
    const response = await fetch(`${API_URL}/api/data`); // замени на свой endpoint
    if (!response.ok) throw new Error('Ошибка сети');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Ошибка запроса к бэкенду:', error);
  }
};
async function api(path, opts = {}) {
  const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin' }, opts));
  return res;
}

async function login() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;
  const res = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    document.getElementById('login-error').textContent = err.error || 'Ошибка входа';
    document.getElementById('login-error').classList.remove('hidden');
    return;
  }
  document.getElementById('login-box').classList.add('hidden');
  document.getElementById('admin-panel').classList.remove('hidden');
  loadAdminState();
}

async function loadAdminState() {
  const res = await api('/api/admin/active');
  if (!res.ok) {
    console.error('Не удалось получить активное число');
    return;
  }
  const data = await res.json();
  document.getElementById('admin-active').textContent = (data.value !== null && data.value !== undefined) ? data.value : '---';

  const hres = await api('/api/history?limit=50');
  if (hres.ok) {
    const hist = await hres.json();
    const node = document.getElementById('admin-history');
    node.innerHTML = hist.map(h => '<div>' + new Date(h.timestamp).toLocaleString('ru-RU') + ' — <strong>' + h.actor + '</strong>: ' + h.value + '</div>').join('');
  }
}

async function setActive() {
  const v = document.getElementById('set-number').value;
  const res = await api('/api/admin/active', { method: 'POST', body: JSON.stringify({ value: v }) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    alert(err.error || 'Ошибка установки');
    return;
  }
  alert('Установлено успешно');
  document.getElementById('set-number').value = '';
  loadAdminState();
}

async function logout() {
  await api('/api/admin/logout', { method: 'POST' });
  document.getElementById('login-box').classList.remove('hidden');
  document.getElementById('admin-panel').classList.add('hidden');
}

document.getElementById('login-btn').addEventListener('click', login);
document.getElementById('set-btn').addEventListener('click', setActive);
document.getElementById('logout-btn').addEventListener('click', logout);
