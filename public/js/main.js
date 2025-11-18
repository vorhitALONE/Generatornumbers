// main.js — логика для index.html
let activeNumber = null;
let historyData = [];

async function fetchActiveNumber() {
  try {
    const response = await fetch('/api/active');
    if (!response.ok) throw new Error('Ошибка загрузки активного числа');
    const data = await response.json();
    activeNumber = data.value;
    document.getElementById('active-number-display').textContent = (data.value !== null && data.value !== undefined) ? data.value : '---';
    document.getElementById('active-number-time').textContent = data.updatedAt ? ('Обновлено: ' + new Date(data.updatedAt).toLocaleString('ru-RU')) : 'Обновлено: -';
  } catch (error) {
    document.getElementById('active-number-display').textContent = '---';
    document.getElementById('active-number-time').textContent = 'Ошибка загрузки';
  }
}

async function generateNumber() {
  const btn = document.getElementById('generate-btn');
  const resultContainer = document.getElementById('result-container');
  const errorContainer = document.getElementById('error-container');

  btn.disabled = true;
  btn.innerHTML = '<span class="flex items-center space-x-3"><i class="fa-solid fa-spinner fa-spin text-xl"></i><span>Генерация...</span></span>';
  errorContainer.classList.add('hidden');

  try {
    const response = await fetch('/api/generate', { method: 'POST' });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || 'Ошибка генерации числа');
    }

    const data = await response.json();
    document.getElementById('generated-number').textContent = data.value;
    document.getElementById('generated-time').textContent = 'Сгенерировано: ' + new Date(data.generatedAt).toLocaleString('ru-RU');
    resultContainer.classList.remove('hidden');

    await fetchHistory();
    await fetchActiveNumber();
  } catch (error) {
    document.getElementById('error-message').textContent = error.message;
    errorContainer.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span class="flex items-center space-x-3"><i class="fa-solid fa-wand-magic-sparkles text-xl"></i><span>Сгенерировать</span></span>';
  }
}

async function fetchHistory() {
  const historyList = document.getElementById('history-list');

  try {
    const response = await fetch('/api/history?limit=20');
    if (!response.ok) throw new Error('Ошибка загрузки истории');

    const data = await response.json();
    historyData = data;

    if (data.length === 0) {
      historyList.innerHTML = '<div class="text-center py-8 text-slate-500"><i class="fa-solid fa-inbox text-3xl mb-3"></i><p>История пуста</p></div>';
      return;
    }

    historyList.innerHTML = data.map(item => {
      const isAdmin = item.actor === 'admin';
      const iconClass = isAdmin ? 'fa-user-shield' : 'fa-user';
      const bgClass = isAdmin ? 'bg-purple-50 border-purple-200' : 'bg-blue-50 border-blue-200';
      const textClass = isAdmin ? 'text-purple-700' : 'text-blue-700';
      const actionText = isAdmin ? 'установил число' : 'сгенерировал число';

      return '<div class="flex items-center justify-between p-4 rounded-lg border-2 ' + bgClass + '"><div class="flex items-center space-x-4"><div class="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm"><i class="fa-solid ' + iconClass + ' ' + textClass + '"></i></div><div><div class="font-semibold text-slate-800">Число: <span class="text-2xl">' + item.value + '</span></div><div class="text-xs text-slate-600">' + item.actor + ' ' + actionText + '</div></div></div><div class="text-right"><div class="text-xs text-slate-500">' + new Date(item.timestamp).toLocaleString('ru-RU') + '</div></div></div>';
    }).join('');
  } catch (error) {
    historyList.innerHTML = '<div class="text-center py-8 text-red-500"><i class="fa-solid fa-circle-exclamation text-3xl mb-3"></i><p>Ошибка загрузки истории</p></div>';
  }
}

document.getElementById('generate-btn').addEventListener('click', generateNumber);
document.getElementById('refresh-history-btn').addEventListener('click', fetchHistory);

fetchActiveNumber();
fetchHistory();
setInterval(fetchActiveNumber, 10000);
