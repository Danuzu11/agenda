const envConfig = window.APP_CONFIG || {};
const GSI_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const HEADERS = ['dia', 'horas', 'actividades'];

let tokenClient = null;
let pendingTokenResolver = null;

const state = {
  apiKey: localStorage.getItem('gsheets_key') || envConfig.apiKey || '',
  clientId: localStorage.getItem('gsheets_clientid') || envConfig.clientId || '',
  sheetId: localStorage.getItem('gsheets_id') || envConfig.sheetId || '',
  accessToken: localStorage.getItem('gsheets_access_token') || '',
  tokenExpiresAt: Number(localStorage.getItem('gsheets_access_exp') || '0'),
  tabs: [],
  activeTab: 0
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeSheetTitle(name) {
  return name.replace(/[\[\]\*\?\/\\]/g, ' ').trim().slice(0, 90);
}

function getActiveTab() {
  return state.tabs[state.activeTab];
}

function toast(msg, type = 'ok') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(() => { t.className = 'toast'; }, 2500);
}

function setConn(status) {
  const dot = document.getElementById('dot');
  const lbl = document.getElementById('conn-label');
  dot.className = 'dot' + (status === 'ok' ? ' ok' : status === 'loading' ? ' loading' : '');
  lbl.textContent = status === 'ok'
    ? 'conectado a sheets'
    : status === 'loading'
      ? 'conectando...'
      : status === 'err'
        ? 'error de conexión'
        : 'sin conectar';
}

function parseApiError(payload, fallbackMessage) {
  if (payload && payload.error) {
    if (typeof payload.error === 'string') return payload.error;
    if (payload.error.message) return payload.error.message;
    if (Array.isArray(payload.error.errors) && payload.error.errors[0] && payload.error.errors[0].message) {
      return payload.error.errors[0].message;
    }
  }
  return fallbackMessage;
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  let payload = null;
  try {
    payload = await res.json();
  } catch (_err) {
    payload = null;
  }
  if (!res.ok) {
    throw new Error(parseApiError(payload, `HTTP ${res.status}`));
  }
  return payload;
}

function persistConfig() {
  localStorage.setItem('gsheets_key', state.apiKey);
  localStorage.setItem('gsheets_clientid', state.clientId);
  localStorage.setItem('gsheets_id', state.sheetId);
}

function persistToken() {
  if (state.accessToken) {
    localStorage.setItem('gsheets_access_token', state.accessToken);
    localStorage.setItem('gsheets_access_exp', String(state.tokenExpiresAt || 0));
  } else {
    localStorage.removeItem('gsheets_access_token');
    localStorage.removeItem('gsheets_access_exp');
  }
}

function openConfigPanelWithValues() {
  const panel = document.getElementById('config-panel');
  panel.classList.add('open');
  document.getElementById('inp-key').value = state.apiKey;
  document.getElementById('inp-clientid').value = state.clientId;
  document.getElementById('inp-sheetid').value = state.sheetId;
}

function toggleConfig() {
  const panel = document.getElementById('config-panel');
  panel.classList.toggle('open');
  if (panel.classList.contains('open')) {
    document.getElementById('inp-key').value = state.apiKey;
    document.getElementById('inp-clientid').value = state.clientId;
    document.getElementById('inp-sheetid').value = state.sheetId;
  }
}

function saveConfig() {
  const key = document.getElementById('inp-key').value.trim();
  const clientId = document.getElementById('inp-clientid').value.trim();
  const sheetId = document.getElementById('inp-sheetid').value.trim();
  if (!key || !clientId || !sheetId) {
    toast('completa API key, client id y sheet id', 'err');
    return;
  }
  state.apiKey = key;
  state.clientId = clientId;
  state.sheetId = sheetId;
  persistConfig();
  initGoogleTokenClient();
  document.getElementById('config-panel').classList.remove('open');
  toast('configuración guardada');
}

function initGoogleTokenClient() {
  if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) return;
  if (!state.clientId) return;
  tokenClient = window.google.accounts.oauth2.initTokenClient({
    client_id: state.clientId,
    scope: GSI_SCOPE,
    callback: () => {}
  });
}

function tokenIsValid() {
  return Boolean(state.accessToken) && state.tokenExpiresAt > Date.now() + 30_000;
}

function revokeToken() {
  if (state.accessToken && window.google && window.google.accounts && window.google.accounts.oauth2) {
    window.google.accounts.oauth2.revoke(state.accessToken);
  }
  state.accessToken = '';
  state.tokenExpiresAt = 0;
  persistToken();
}

function requestAccessToken(promptMode) {
  return new Promise((resolve, reject) => {
    if (!tokenClient) {
      reject(new Error('configura primero el client id de Google'));
      return;
    }
    pendingTokenResolver = { resolve, reject };
    tokenClient.callback = (response) => {
      if (response.error) {
        const message = response.error_description || response.error;
        pendingTokenResolver.reject(new Error(message));
        pendingTokenResolver = null;
        return;
      }
      state.accessToken = response.access_token;
      const expiresIn = Number(response.expires_in || 3600);
      state.tokenExpiresAt = Date.now() + expiresIn * 1000;
      persistToken();
      pendingTokenResolver.resolve(state.accessToken);
      pendingTokenResolver = null;
    };
    tokenClient.requestAccessToken({ prompt: promptMode });
  });
}

async function ensureAccessToken(interactive) {
  if (tokenIsValid()) return state.accessToken;
  if (!state.apiKey || !state.clientId || !state.sheetId) {
    openConfigPanelWithValues();
    throw new Error('faltan datos de configuración');
  }
  const promptMode = interactive ? 'consent' : '';
  return requestAccessToken(promptMode);
}

async function authorizeGoogle() {
  setConn('loading');
  try {
    await ensureAccessToken(true);
    setConn('ok');
    toast('autorización correcta ✓');
    await syncSheet();
  } catch (err) {
    setConn('err');
    toast(`error autorización: ${err.message}`, 'err');
  }
}

async function sheetsRequest(path, options = {}, interactiveAuth = false) {
  const token = await ensureAccessToken(interactiveAuth);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${state.sheetId}${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(state.apiKey)}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  try {
    return await fetchJson(url, { ...options, headers });
  } catch (err) {
    if (String(err.message).toLowerCase().includes('invalid credentials')) {
      revokeToken();
      throw new Error('sesión expirada, vuelve a autorizar');
    }
    throw err;
  }
}

function renderTabs() {
  const wrap = document.getElementById('tabs-wrap');
  const addBtn = wrap.querySelector('.tab-add');
  wrap.querySelectorAll('.tab').forEach((node) => node.remove());
  state.tabs.forEach((tab, i) => {
    const btn = document.createElement('button');
    btn.className = 'tab' + (i === state.activeTab ? ' active' : '');
    btn.textContent = tab.title;
    btn.onclick = () => { switchTab(i); };
    wrap.insertBefore(btn, addBtn);
  });
}

function renderTable() {
  const tab = getActiveTab();
  const rows = tab ? tab.rows : [];
  const tbody = document.getElementById('tbody');
  if (!rows || !rows.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="4">sin entradas — agrega la primera abajo</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map((row, i) => `
    <tr>
      <td class="td-day">día ${escapeHtml(row.day)}</td>
      <td class="td-hours">${escapeHtml(row.hours)}h</td>
      <td class="td-desc">
        <span class="td-desc-inner" id="desc-${i}" title="${escapeHtml(row.desc)}">${escapeHtml(row.desc)}</span>
      </td>
      <td class="td-actions">
        <button class="icon-btn" onclick="editEntry(${i})" title="editar"><i class="ti ti-pencil"></i></button>
        <button class="icon-btn" onclick="toggleDesc(${i})" title="expandir"><i class="ti ti-arrows-maximize"></i></button>
        <button class="icon-btn del" onclick="deleteEntry(${i})" title="eliminar"><i class="ti ti-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

function updateStats() {
  const tab = getActiveTab();
  const rows = tab ? tab.rows : [];
  const total = rows.reduce((sum, row) => sum + row.hours, 0);
  const days = rows.length;
  document.getElementById('s-total').textContent = total.toFixed(1);
  document.getElementById('s-days').textContent = String(days);
  document.getElementById('s-avg').textContent = days ? (total / days).toFixed(1) : '0';
  document.getElementById('s-last').textContent = rows.length ? `día ${rows[rows.length - 1].day}` : '—';
}

function switchTab(index) {
  if (!state.tabs[index]) return;
  state.activeTab = index;
  renderTabs();
  renderTable();
  updateStats();
  document.getElementById('card-month').textContent = state.tabs[index].title;
}

function toggleDesc(index) {
  const node = document.getElementById(`desc-${index}`);
  if (node) node.classList.toggle('expanded');
}

function sheetNameForRange(title) {
  return `'${title.replace(/'/g, "''")}'`;
}

function parseRows(values = []) {
  return values
    .filter((row) => row[0] && !Number.isNaN(Number(row[0])))
    .map((row, idx) => ({
      day: Number(row[0]),
      hours: Number(row[1]) || 0,
      desc: row[2] || '',
      rowNumber: idx + 2
    }))
    .filter((row) => row.hours > 0);
}

async function ensureHeader(tabTitle) {
  const range = encodeURIComponent(`${sheetNameForRange(tabTitle)}!A1:C1`);
  await sheetsRequest(`/values/${range}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: [HEADERS] })
  });
}

async function loadTabRows(tab) {
  const range = encodeURIComponent(`${sheetNameForRange(tab.title)}!A:C`);
  const payload = await sheetsRequest(`/values/${range}`);
  tab.rows = parseRows((payload.values || []).slice(1));
}

async function loadSpreadsheetMeta() {
  const payload = await sheetsRequest('?fields=sheets(properties(sheetId,title,index))');
  const sheets = (payload.sheets || [])
    .map((sheet) => ({
      title: sheet.properties.title,
      sheetId: sheet.properties.sheetId,
      index: sheet.properties.index,
      rows: []
    }))
    .sort((a, b) => a.index - b.index);
  state.tabs = sheets;
  if (!state.tabs.length) throw new Error('el spreadsheet no tiene pestañas');
  state.activeTab = Math.min(state.activeTab, state.tabs.length - 1);
}

async function syncSheet() {
  setConn('loading');
  try {
    await loadSpreadsheetMeta();
    const active = getActiveTab();
    await loadTabRows(active);
    renderTabs();
    switchTab(state.activeTab);
    setConn('ok');
    toast(`${active.rows.length} entradas cargadas ✓`);
  } catch (err) {
    setConn('err');
    toast(`error sync: ${err.message}`, 'err');
  }
}

async function addTab() {
  const requestedName = prompt('Nombre de la pestaña (ej: marzo 2026):');
  if (!requestedName) return;
  const title = normalizeSheetTitle(requestedName);
  if (!title) {
    toast('nombre de pestaña inválido', 'err');
    return;
  }
  setConn('loading');
  try {
    const payload = await sheetsRequest(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title } } }]
      })
    });
    const newSheetId = payload.replies[0].addSheet.properties.sheetId;
    await ensureHeader(title);
    state.tabs.push({ title, sheetId: newSheetId, rows: [] });
    state.tabs.sort((a, b) => a.title.localeCompare(b.title));
    state.activeTab = state.tabs.findIndex((tab) => tab.sheetId === newSheetId);
    renderTabs();
    switchTab(state.activeTab);
    setConn('ok');
    toast('pestaña creada ✓');
  } catch (err) {
    setConn('err');
    toast(`error creando pestaña: ${err.message}`, 'err');
  }
}

async function deleteActiveTab() {
  const tab = getActiveTab();
  if (!tab) return;
  if (state.tabs.length < 2) {
    toast('deja al menos una pestaña', 'err');
    return;
  }
  if (!confirm(`¿Borrar la pestaña "${tab.title}"?`)) return;
  setConn('loading');
  try {
    await sheetsRequest(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({
        requests: [{ deleteSheet: { sheetId: tab.sheetId } }]
      })
    });
    state.tabs.splice(state.activeTab, 1);
    state.activeTab = Math.max(0, state.activeTab - 1);
    renderTabs();
    switchTab(state.activeTab);
    setConn('ok');
    toast('pestaña eliminada ✓');
  } catch (err) {
    setConn('err');
    toast(`error borrando pestaña: ${err.message}`, 'err');
  }
}

async function addEntry() {
  const tab = getActiveTab();
  if (!tab) return;
  const day = Number.parseInt(document.getElementById('f-day').value, 10);
  const hours = Number.parseFloat(document.getElementById('f-hours').value);
  const desc = document.getElementById('f-desc').value.trim();
  if (!day || !hours || !desc) {
    toast('completa todos los campos', 'err');
    return;
  }
  setConn('loading');
  try {
    const range = encodeURIComponent(`${sheetNameForRange(tab.title)}!A:C`);
    const payload = await sheetsRequest(`/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
      method: 'POST',
      body: JSON.stringify({ values: [[day, hours, desc]] })
    });
    const updatedRange = payload.updates && payload.updates.updatedRange ? payload.updates.updatedRange : '';
    const rowMatch = updatedRange.match(/![A-Z]+(\d+):/);
    const rowNumber = rowMatch ? Number(rowMatch[1]) : (tab.rows.length + 2);
    tab.rows.push({ day, hours, desc, rowNumber });
    tab.rows.sort((a, b) => a.day - b.day);
    document.getElementById('f-day').value = '';
    document.getElementById('f-hours').value = '';
    document.getElementById('f-desc').value = '';
    renderTable();
    updateStats();
    setConn('ok');
    toast('entrada agregada ✓');
    await loadTabRows(tab);
    renderTable();
    updateStats();
  } catch (err) {
    setConn('err');
    toast(`error agregando entrada: ${err.message}`, 'err');
  }
}

async function editEntry(index) {
  const tab = getActiveTab();
  if (!tab || !tab.rows[index]) return;
  const entry = tab.rows[index];
  const dayText = prompt('Nuevo día:', String(entry.day));
  if (dayText === null) return;
  const hoursText = prompt('Nuevas horas:', String(entry.hours));
  if (hoursText === null) return;
  const descText = prompt('Nueva descripción:', entry.desc);
  if (descText === null) return;
  const day = Number.parseInt(dayText, 10);
  const hours = Number.parseFloat(hoursText);
  const desc = descText.trim();
  if (!day || !hours || !desc) {
    toast('datos inválidos para editar', 'err');
    return;
  }
  setConn('loading');
  try {
    const range = encodeURIComponent(`${sheetNameForRange(tab.title)}!A${entry.rowNumber}:C${entry.rowNumber}`);
    await sheetsRequest(`/values/${range}?valueInputOption=USER_ENTERED`, {
      method: 'PUT',
      body: JSON.stringify({ values: [[day, hours, desc]] })
    });
    await loadTabRows(tab);
    renderTable();
    updateStats();
    setConn('ok');
    toast('entrada actualizada ✓');
  } catch (err) {
    setConn('err');
    toast(`error actualizando entrada: ${err.message}`, 'err');
  }
}

async function deleteEntry(index) {
  const tab = getActiveTab();
  if (!tab || !tab.rows[index]) return;
  if (!confirm('¿Eliminar esta entrada?')) return;
  setConn('loading');
  try {
    const rowNumber = tab.rows[index].rowNumber;
    await sheetsRequest(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({
        requests: [{
          deleteDimension: {
            range: {
              sheetId: tab.sheetId,
              dimension: 'ROWS',
              startIndex: rowNumber - 1,
              endIndex: rowNumber
            }
          }
        }]
      })
    });
    await loadTabRows(tab);
    renderTable();
    updateStats();
    setConn('ok');
    toast('entrada eliminada ✓');
  } catch (err) {
    setConn('err');
    toast(`error eliminando entrada: ${err.message}`, 'err');
  }
}

function exportCSV() {
  const tab = getActiveTab();
  const rows = tab ? tab.rows : [];
  if (!rows.length) {
    toast('no hay datos para exportar', 'err');
    return;
  }
  const lines = ['dia,horas,actividades', ...rows.map((row) => `${row.day},${row.hours},"${row.desc.replace(/"/g, '""')}"`)];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${tab.title}.csv`;
  link.click();
  toast('CSV exportado ✓');
}

async function boot() {
  initGoogleTokenClient();
  if (!state.apiKey || !state.clientId || !state.sheetId) {
    openConfigPanelWithValues();
    setConn('err');
    return;
  }
  if (!tokenIsValid()) {
    openConfigPanelWithValues();
    setConn('err');
    toast('haz clic en autorizar para iniciar sesión', 'err');
    return;
  }
  await syncSheet();
}

boot();
