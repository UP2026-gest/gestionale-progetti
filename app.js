// ============================================================
// CONFIG
// ============================================================
const GITHUB_OWNER = 'UP2026-gest';
const GITHUB_REPO  = 'gestionale-progetti';
const DATA_FILE    = 'progetti.json';
const BRANCH       = 'main';
const API_BASE     = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${DATA_FILE}`;

// ============================================================
// STATE
// ============================================================
let currentUser   = null;
let dati          = { progetti: [], meta: {} };
let fileSha       = null;
let progettoAperto = null;
let azioneEditId  = null;
let reminderInterval = null;
let filtriCorrente = {};

// ============================================================
// UTILS
// ============================================================
function getToken() { return localStorage.getItem('ghtoken') || ''; }
function saveToken(t) { localStorage.setItem('ghtoken', t); }

function oggi() { return new Date().toISOString().split('T')[0]; }

function formatData(iso) {
  if (!iso) return '—';
  const [y,m,d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function diffGiorni(iso) {
  if (!iso) return null;
  const oggi = new Date(); oggi.setHours(0,0,0,0);
  const data = new Date(iso); data.setHours(0,0,0,0);
  return Math.floor((data - oggi) / 86400000);
}

function scadenzaClass(iso, stato) {
  if (!iso || isClosed(stato)) return '';
  const d = diffGiorni(iso);
  if (d < 0) return 'scaduta';
  if (d <= 3) return 'in-scadenza';
  return '';
}

function isClosed(stato) {
  return stato === 'Chiusa vinta' || stato === 'Chiusa persa';
}

function statoClass(stato) {
  const m = {
    'Primo contatto': 'stato-primo',
    'Proposta in preparazione': 'stato-proposta',
    'Attesa riscontro': 'stato-attesa',
    'Sospesa': 'stato-sospesa',
    'Chiusa vinta': 'stato-vinta',
    'Chiusa persa': 'stato-persa'
  };
  return m[stato] || 'stato-primo';
}

function socClass(soc) {
  if (!soc) return 'soc-mix';
  if (soc === 'UP') return 'soc-up';
  if (soc === 'MSF') return 'soc-msf';
  if (soc === 'Studio Piazza') return 'soc-sp';
  return 'soc-mix';
}

function uid() { return 'a' + Math.random().toString(36).substr(2,9); }

function showToast(msg, dur=2500) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), dur);
}

function avatarColor(nome) {
  if (nome === 'Renato') return '#2563eb';
  if (nome === 'Stefania') return '#9333ea';
  if (nome === 'Matteo') return '#16a34a';
  return '#6b7280';
}

// ============================================================
// LOGIN / LOGOUT
// ============================================================
function login(nome) {
  const tokenEl = document.getElementById('token-input');
  const raw = tokenEl.value.trim();
  // accept new token only if it looks like a real token
  if (raw && raw.startsWith('ghp_')) saveToken(raw);
  if (!getToken()) {
    document.getElementById('token-section').style.display = 'block';
    tokenEl.value = '';
    tokenEl.placeholder = 'Incolla qui il token ghp_...';
    tokenEl.focus();
    showToast('Inserisci il token GitHub per continuare');
    return;
  }
  currentUser = nome;
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  const av = document.getElementById('avatar-current');
  av.textContent = nome[0];
  av.style.background = avatarColor(nome);
  document.getElementById('user-label').textContent = nome;
  caricaDati();
}

function logout() {
  currentUser = null;
  clearInterval(reminderInterval);
  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('token-input').value = '';
}

// ============================================================
// GITHUB DATA
// ============================================================
async function caricaDati() {
  showToast('Caricamento dati…', 5000);
  try {
    const r = await fetch(API_BASE, {
      headers: { Authorization: `token ${getToken()}`, Accept: 'application/vnd.github.v3+json' }
    });
    if (r.status === 404) {
      // file non esiste ancora, carica dati iniziali embedded
      await caricaDatiIniziali();
      return;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const json = await r.json();
    fileSha = json.sha;
    dati = JSON.parse(decodeURIComponent(escape(atob(json.content.replace(/\n/g,'')))));
    showToast('Dati caricati');
    renderAll();
    avviaReminder();
  } catch(e) {
    showToast('Errore caricamento: ' + e.message, 4000);
    await caricaDatiIniziali();
  }
}

async function caricaDatiIniziali() {
  try {
    const r = await fetch('progetti_iniziali.json');
    dati = await r.json();
    fileSha = null;
    showToast('Dati locali caricati (non ancora su GitHub)');
    renderAll();
    avviaReminder();
  } catch(e) {
    dati = { progetti: [], meta: {} };
    renderAll();
  }
}

async function salvaDati(messaggio) {
  dati.meta.ultimo_aggiornamento = oggi();
  dati.meta.ultimo_utente = currentUser;
  const jsonStr = JSON.stringify(dati, null, 2);
  const bytes = new TextEncoder().encode(jsonStr);
  const content = btoa(String.fromCharCode(...bytes));
  const body = { message: messaggio || `Update by ${currentUser}`, content, branch: BRANCH };
  if (fileSha) body.sha = fileSha;
  try {
    const r = await fetch(API_BASE, {
      method: 'PUT',
      headers: {
        Authorization: `token ${getToken()}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const err = await r.json();
      if (r.status === 409) {
        showToast('Conflitto: qualcuno ha salvato prima. Ricarico…', 3000);
        setTimeout(caricaDati, 1500);
        return false;
      }
      throw new Error(err.message);
    }
    const json = await r.json();
    fileSha = json.content.sha;
    showToast('Salvato su GitHub ✓');
    return true;
  } catch(e) {
    showToast('Errore salvataggio: ' + e.message, 4000);
    return false;
  }
}

// ============================================================
// RENDER ALL
// ============================================================
function renderAll() {
  const filtrati = filtra(dati.progetti);
  renderLista(filtrati);
  renderKanban(filtrati);
  renderDashboard(dati.progetti);
  checkBadge();
}

// ============================================================
// FILTRI
// ============================================================
function applicaFiltri() {
  filtriCorrente = {
    search: document.getElementById('search-input').value.toLowerCase(),
    societa: document.getElementById('f-societa').value,
    responsabile: document.getElementById('f-responsabile').value,
    stato: document.getElementById('f-stato').value,
    scadenza: document.getElementById('f-scadenza').value
  };
  renderAll();
}

function resetFiltri() {
  document.getElementById('search-input').value = '';
  document.getElementById('f-societa').value = '';
  document.getElementById('f-responsabile').value = '';
  document.getElementById('f-stato').value = '';
  document.getElementById('f-scadenza').value = '';
  filtriCorrente = {};
  renderAll();
}

function filtra(progetti) {
  const f = filtriCorrente;
  return progetti.filter(p => {
    if (f.search && !p.oggetto.toLowerCase().includes(f.search) && !(p.note||'').toLowerCase().includes(f.search) && !(p.obiettivo||'').toLowerCase().includes(f.search)) return false;
    if (f.societa && p.societa !== f.societa) return false;
    if (f.responsabile && p.responsabile !== f.responsabile) return false;
    if (f.stato && p.stato !== f.stato) return false;
    if (f.scadenza) {
      const d = diffGiorni(p.scadenza);
      if (f.scadenza === 'scadute' && (d === null || d >= 0)) return false;
      if (f.scadenza === 'oggi' && d !== 0) return false;
      if (f.scadenza === '3giorni' && (d === null || d < 0 || d > 3)) return false;
      if (f.scadenza === 'settimana' && (d === null || d < 0 || d > 7)) return false;
      if (f.scadenza === 'mese' && (d === null || d < 0 || d > 30)) return false;
    }
    return true;
  });
}

// ============================================================
// LISTA
// ============================================================
function renderLista(progetti) {
  const body = document.getElementById('lista-body');
  if (!progetti.length) {
    body.innerHTML = `<div class="empty-state"><div class="es-icon">📋</div><h3>Nessun progetto trovato</h3><p>Modifica i filtri o aggiungi un nuovo progetto</p></div>`;
    return;
  }
  body.innerHTML = progetti.map(p => {
    const cls = scadenzaClass(p.scadenza, p.stato);
    const chiusa = isClosed(p.stato);
    const azioniAperte = (p.azioni||[]).filter(a => !a.completata).length;
    const azioniTot = (p.azioni||[]).length;
    const scadLabel = scadenzaLabel(p.scadenza, p.stato);
    return `
    <div class="lista-row ${cls} ${chiusa?'chiusa':''}" onclick="apriPanel('${p.id}')">
      <div class="col-societa"><span class="tag-soc ${socClass(p.societa)}">${p.societa||'—'}</span></div>
      <div class="col-oggetto">
        <div class="nome">${p.oggetto}</div>
        <div class="obiettivo">${p.obiettivo||''}</div>
      </div>
      <div class="col-resp">${p.responsabile||'—'}</div>
      <div class="col-stato"><span class="stato-pill ${statoClass(p.stato)}">${p.stato||'—'}</span></div>
      <div class="col-scad"><span class="${scadLabel.cls}">${scadLabel.testo}</span></div>
      <div class="col-azioni-n">
        ${azioniTot > 0 ? `<span class="azioni-badge ${azioniAperte>0?'has-open':''}">${azioniAperte}/${azioniTot}</span>` : '<span class="azioni-badge">—</span>'}
      </div>
    </div>`;
  }).join('');
}

function scadenzaLabel(iso, stato) {
  if (!iso) return { testo: '—', cls: '' };
  if (isClosed(stato)) return { testo: formatData(iso), cls: 'scad-ok' };
  const d = diffGiorni(iso);
  if (d < 0) return { testo: `Scaduta ${formatData(iso)}`, cls: 'scad-danger' };
  if (d === 0) return { testo: 'Scade oggi', cls: 'scad-warn' };
  if (d <= 3) return { testo: `Fra ${d} gg`, cls: 'scad-warn' };
  return { testo: formatData(iso), cls: 'scad-ok' };
}

// ============================================================
// KANBAN
// ============================================================
const KANBAN_STATI = ['Primo contatto','Proposta in preparazione','Attesa riscontro','Sospesa','Chiusa vinta','Chiusa persa'];

function renderKanban(progetti) {
  const board = document.getElementById('kanban-board');
  board.innerHTML = KANBAN_STATI.map(stato => {
    const lista = progetti.filter(p => p.stato === stato);
    const cards = lista.map(p => {
      const cls = scadenzaClass(p.scadenza, p.stato);
      const scad = p.scadenza ? formatData(p.scadenza) : '—';
      return `<div class="kanban-card ${cls}" onclick="apriPanel('${p.id}')">
        <div class="k-oggetto">${p.oggetto}</div>
        <div class="k-resp">${p.societa||''} · ${p.responsabile||''}</div>
        <div class="k-scad">${scad}</div>
      </div>`;
    }).join('');
    return `<div class="kanban-col">
      <div class="kanban-col-header">
        <span>${stato}</span>
        <span class="k-count">${lista.length}</span>
      </div>
      ${cards || '<div style="font-size:12px;color:var(--c-text3);text-align:center;padding:16px 0">Nessuno</div>'}
    </div>`;
  }).join('');
}

// ============================================================
// DASHBOARD
// ============================================================
function renderDashboard(progetti) {
  const cont = document.getElementById('dashboard-content');
  const totale = progetti.length;
  const attivi = progetti.filter(p => !isClosed(p.stato)).length;
  const vinte  = progetti.filter(p => p.stato === 'Chiusa vinta').length;
  const scadute = progetti.filter(p => !isClosed(p.stato) && diffGiorni(p.scadenza) !== null && diffGiorni(p.scadenza) < 0).length;
  const winRate = totale > 0 ? Math.round(vinte / totale * 100) : 0;

  const perStato = {};
  KANBAN_STATI.forEach(s => perStato[s] = progetti.filter(p => p.stato === s).length);

  const perResp = {};
  ['Renato','Stefania','Matteo','Tutti'].forEach(r => {
    perResp[r] = progetti.filter(p => p.responsabile === r || (r==='Tutti' && p.responsabile==='Tutti')).length;
  });

  const colori = ['#2563eb','#9333ea','#16a34a','#ea580c','#ca8a04','#dc2626'];
  const maxSt = Math.max(...Object.values(perStato), 1);

  cont.innerHTML = `
  <div class="dashboard-grid">
    <div class="stat-card"><div class="stat-label">Progetti totali</div><div class="stat-value">${totale}</div></div>
    <div class="stat-card"><div class="stat-label">Attivi</div><div class="stat-value">${attivi}</div></div>
    <div class="stat-card"><div class="stat-label">Chiusi vinti</div><div class="stat-value" style="color:var(--c-success)">${vinte}</div></div>
    <div class="stat-card"><div class="stat-label">Scaduti</div><div class="stat-value" style="color:var(--c-danger)">${scadute}</div></div>
    <div class="stat-card"><div class="stat-label">Win rate</div><div class="stat-value">${winRate}%</div></div>
  </div>
  <div class="dash-section">
    <h3>Distribuzione per stato</h3>
    ${KANBAN_STATI.map((s,i) => `
    <div class="bar-row">
      <div class="bar-label"><span class="stato-pill ${statoClass(s)}">${s}</span></div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(perStato[s]/maxSt*100)}%;background:${colori[i]}"></div></div>
      <div class="bar-num">${perStato[s]}</div>
    </div>`).join('')}
  </div>
  <div class="dash-section">
    <h3>Progetti per responsabile</h3>
    ${Object.entries(perResp).filter(([,v])=>v>0).map(([nome,n])=>`
    <div class="bar-row">
      <div class="bar-label">${nome}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${Math.round(n/totale*100)}%;background:${avatarColor(nome)}"></div></div>
      <div class="bar-num">${n}</div>
    </div>`).join('')}
  </div>`;
}

// ============================================================
// PANEL LATERALE
// ============================================================
function apriPanel(id) {
  progettoAperto = dati.progetti.find(p => p.id === id);
  if (!progettoAperto) return;
  renderPanel();
  document.getElementById('side-panel').classList.remove('hidden');
}

function chiudiPanel() {
  document.getElementById('side-panel').classList.add('hidden');
  progettoAperto = null;
  azioneEditId = null;
}

function renderPanel() {
  const p = progettoAperto;
  document.getElementById('sp-societa').textContent = p.societa || '';
  document.getElementById('sp-titolo').textContent = p.oggetto;

  const body = document.getElementById('side-body');
  const azioni = p.azioni || [];
  const storia = p.storia || [];

  body.innerHTML = `
  <!-- DETTAGLI -->
  <div class="sp-section">
    <div class="sp-section-title">Dettagli
      <button class="btn-small" onclick="apriEditProgetto('${p.id}')">Modifica</button>
    </div>
    <div class="sp-grid">
      <div class="sp-field"><label>Responsabile</label><div class="val">${p.responsabile||'—'}</div></div>
      <div class="sp-field"><label>Stato</label><div class="val"><span class="stato-pill ${statoClass(p.stato)}">${p.stato||'—'}</span></div></div>
      <div class="sp-field"><label>Proposta</label><div class="val">${p.proposta||'—'}</div></div>
      <div class="sp-field"><label>Scadenza</label><div class="val">${formatData(p.scadenza)}</div></div>
      <div class="sp-field"><label>Inizio</label><div class="val">${formatData(p.inizio)}</div></div>
      <div class="sp-field"><label>Strumenti</label><div class="val">${p.strumenti||'—'}</div></div>
      ${p.costi ? `<div class="sp-field"><label>Costi</label><div class="val">€ ${p.costi.toLocaleString()}</div></div>` : ''}
      <div class="sp-field" style="grid-column:1/-1"><label>Obiettivo</label><div class="val">${p.obiettivo||'—'}</div></div>
    </div>
  </div>

  <!-- NOTE -->
  <div class="sp-section">
    <div class="sp-section-title">Note progetto</div>
    <div id="sp-note-view">
      <div style="font-size:13px;color:var(--c-text2);margin-bottom:8px">${p.note || '<em>Nessuna nota</em>'}</div>
      <button class="btn-small-sec" onclick="toggleNoteEdit()">Aggiorna nota</button>
    </div>
    <div id="sp-note-edit" style="display:none">
      <textarea id="sp-note-input" rows="3" style="width:100%;padding:8px;border:1.5px solid var(--c-border);border-radius:6px;font-family:var(--font);font-size:13px;resize:vertical;margin-bottom:8px">${p.note||''}</textarea>
      <div class="form-btns">
        <button class="btn-small-sec" onclick="toggleNoteEdit()">Annulla</button>
        <button class="btn-small" onclick="salvaNota('${p.id}')">Salva nota</button>
      </div>
    </div>
  </div>

  <!-- AZIONI -->
  <div class="sp-section">
    <div class="sp-section-title">Azioni
      <button class="btn-small" onclick="toggleNuovaAzione()">+ Aggiungi</button>
    </div>
    <div id="nuova-azione-form" class="nuova-azione-form" style="display:none;margin-bottom:12px">
      <input type="text" id="az-titolo" placeholder="Descrizione azione *">
      <div class="nuova-az-row">
        <input type="date" id="az-scad" style="flex:1">
        <input type="text" id="az-resp" placeholder="Responsabile" style="flex:1">
      </div>
      <textarea id="az-note" rows="2" placeholder="Note (opzionale)"></textarea>
      <div class="form-btns">
        <button class="btn-small-sec" onclick="toggleNuovaAzione()">Annulla</button>
        <button class="btn-small" onclick="aggiungiAzione('${p.id}')">Aggiungi azione</button>
      </div>
    </div>
    <div class="azioni-list" id="azioni-list">
      ${azioni.length === 0 ? '<div style="font-size:13px;color:var(--c-text3);padding:8px 0">Nessuna azione registrata</div>' :
        azioni.map(a => renderAzione(a, p.id)).join('')}
    </div>
  </div>

  <!-- STORIA -->
  <div class="sp-section">
    <div class="sp-section-title">Storico modifiche</div>
    <div class="storia-list">
      ${storia.length === 0 ? '<div style="font-size:13px;color:var(--c-text3)">Nessuna modifica registrata</div>' :
        [...storia].reverse().map(s => `
        <div class="storia-item">
          <div class="storia-dot"></div>
          <div>
            <div class="storia-text"><strong>${s.utente||'?'}</strong> — ${s.campo}: ${s.da ? `<span style="text-decoration:line-through;color:var(--c-text3)">${s.da}</span> → ` : ''}${s.a}</div>
            <div class="storia-data">${s.data||''}</div>
          </div>
        </div>`).join('')}
    </div>
  </div>`;
}

function renderAzione(a, pid) {
  const d = diffGiorni(a.scadenza);
  const scadCls = !a.completata && a.scadenza && d !== null && d < 0 ? 'scaduta-az' : '';
  return `
  <div class="azione-item ${a.completata?'completata':''} ${scadCls}" id="az-${a.id}">
    <div class="az-top">
      <div class="az-check ${a.completata?'checked':''}" onclick="toggleAzione('${pid}','${a.id}')">${a.completata?'✓':''}</div>
      <div class="az-titolo ${a.completata?'completata-testo':''}">${a.titolo}</div>
      ${a.scadenza ? `<div class="az-scad">${formatData(a.scadenza)}</div>` : ''}
    </div>
    ${a.note ? `<div class="az-note">${a.note}</div>` : ''}
    <div class="az-meta">Aggiunto da ${a.creato_da||'?'} · ${a.creato_il||''}</div>
    <div class="az-actions">
      <button class="az-btn" onclick="editAzione('${pid}','${a.id}')">Modifica</button>
      <button class="az-btn danger" onclick="eliminaAzione('${pid}','${a.id}')">Elimina</button>
    </div>
  </div>`;
}

function toggleNoteEdit() {
  const v = document.getElementById('sp-note-view');
  const e = document.getElementById('sp-note-edit');
  const showing = e.style.display !== 'none';
  v.style.display = showing ? '' : 'none';
  e.style.display = showing ? 'none' : '';
}

async function salvaNota(pid) {
  const p = dati.progetti.find(x => x.id === pid);
  if (!p) return;
  const nuova = document.getElementById('sp-note-input').value;
  logStoria(p, 'nota', p.note, nuova);
  p.note = nuova;
  await salvaDati(`Nota aggiornata: ${p.oggetto}`);
  progettoAperto = p;
  renderPanel();
  renderAll();
}

function toggleNuovaAzione() {
  const f = document.getElementById('nuova-azione-form');
  f.style.display = f.style.display === 'none' ? '' : 'none';
  if (f.style.display !== 'none') document.getElementById('az-titolo').focus();
}

async function aggiungiAzione(pid) {
  const titolo = document.getElementById('az-titolo').value.trim();
  if (!titolo) { showToast('Inserisci una descrizione'); return; }
  const p = dati.progetti.find(x => x.id === pid);
  if (!p) return;
  if (!p.azioni) p.azioni = [];
  const nuova = {
    id: uid(),
    titolo,
    scadenza: document.getElementById('az-scad').value || null,
    responsabile: document.getElementById('az-resp').value || currentUser,
    note: document.getElementById('az-note').value || '',
    completata: false,
    creato_da: currentUser,
    creato_il: oggi()
  };
  p.azioni.push(nuova);
  logStoria(p, 'azione aggiunta', '', nuova.titolo);
  await salvaDati(`Azione aggiunta: ${p.oggetto}`);
  progettoAperto = p;
  renderPanel();
  renderAll();
}

async function toggleAzione(pid, aid) {
  const p = dati.progetti.find(x => x.id === pid);
  if (!p) return;
  const a = p.azioni.find(x => x.id === aid);
  if (!a) return;
  a.completata = !a.completata;
  a.completata_da = a.completata ? currentUser : null;
  a.completata_il = a.completata ? oggi() : null;
  logStoria(p, 'azione', a.titolo, a.completata ? 'completata' : 'riaperta');
  await salvaDati(`Azione ${a.completata?'completata':'riaperta'}: ${p.oggetto}`);
  progettoAperto = p;
  renderPanel();
  renderAll();
}

function editAzione(pid, aid) {
  const p = dati.progetti.find(x => x.id === pid);
  const a = p.azioni.find(x => x.id === aid);
  if (!a) return;
  const el = document.getElementById(`az-${aid}`);
  el.innerHTML = `
    <input type="text" id="edit-az-titolo" value="${a.titolo}" style="width:100%;padding:7px 9px;border:1.5px solid var(--c-border);border-radius:6px;font-family:var(--font);font-size:13px;margin-bottom:7px">
    <div class="nuova-az-row">
      <input type="date" id="edit-az-scad" value="${a.scadenza||''}" style="flex:1;padding:7px 9px;border:1.5px solid var(--c-border);border-radius:6px;font-family:var(--font);font-size:13px">
      <input type="text" id="edit-az-resp" value="${a.responsabile||''}" placeholder="Responsabile" style="flex:1;padding:7px 9px;border:1.5px solid var(--c-border);border-radius:6px;font-family:var(--font);font-size:13px">
    </div>
    <textarea id="edit-az-note" rows="2" style="width:100%;padding:7px 9px;border:1.5px solid var(--c-border);border-radius:6px;font-family:var(--font);font-size:13px;resize:vertical;margin-top:7px">${a.note||''}</textarea>
    <div class="form-btns" style="margin-top:8px">
      <button class="btn-small-sec" onclick="renderPanel()">Annulla</button>
      <button class="btn-small" onclick="salvaEditAzione('${pid}','${aid}')">Salva</button>
    </div>`;
}

async function salvaEditAzione(pid, aid) {
  const p = dati.progetti.find(x => x.id === pid);
  const a = p.azioni.find(x => x.id === aid);
  a.titolo       = document.getElementById('edit-az-titolo').value.trim() || a.titolo;
  a.scadenza     = document.getElementById('edit-az-scad').value || null;
  a.responsabile = document.getElementById('edit-az-resp').value || a.responsabile;
  a.note         = document.getElementById('edit-az-note').value;
  a.modificato_da = currentUser;
  a.modificato_il = oggi();
  await salvaDati(`Azione modificata: ${p.oggetto}`);
  progettoAperto = p;
  renderPanel();
  renderAll();
}

async function eliminaAzione(pid, aid) {
  if (!confirm('Eliminare questa azione?')) return;
  const p = dati.progetti.find(x => x.id === pid);
  const a = p.azioni.find(x => x.id === aid);
  logStoria(p, 'azione eliminata', a.titolo, '');
  p.azioni = p.azioni.filter(x => x.id !== aid);
  await salvaDati(`Azione eliminata: ${p.oggetto}`);
  progettoAperto = p;
  renderPanel();
  renderAll();
}

// ============================================================
// NUOVO / EDIT PROGETTO
// ============================================================
let editingId = null;

function apriNuovoProgetto() {
  editingId = null;
  document.getElementById('modal-title').textContent = 'Nuovo progetto';
  document.getElementById('f-soc').value = 'UP';
  document.getElementById('f-resp').value = currentUser;
  document.getElementById('f-oggetto').value = '';
  document.getElementById('f-obiettivo').value = '';
  document.getElementById('f-stato-form').value = 'Primo contatto';
  document.getElementById('f-proposta').value = 'No';
  document.getElementById('f-inizio').value = oggi();
  document.getElementById('f-scadenza').value = '';
  document.getElementById('f-strumenti').value = '';
  document.getElementById('f-costi').value = '';
  document.getElementById('f-note').value = '';
  document.getElementById('modal-progetto').classList.remove('hidden');
}

function apriEditProgetto(pid) {
  const p = dati.progetti.find(x => x.id === pid);
  if (!p) return;
  editingId = pid;
  document.getElementById('modal-title').textContent = 'Modifica progetto';
  document.getElementById('f-soc').value = p.societa || 'UP';
  document.getElementById('f-resp').value = p.responsabile || currentUser;
  document.getElementById('f-oggetto').value = p.oggetto || '';
  document.getElementById('f-obiettivo').value = p.obiettivo || '';
  document.getElementById('f-stato-form').value = p.stato || 'Primo contatto';
  document.getElementById('f-proposta').value = p.proposta || 'No';
  document.getElementById('f-inizio').value = p.inizio || '';
  document.getElementById('f-scadenza').value = p.scadenza || '';
  document.getElementById('f-strumenti').value = p.strumenti || '';
  document.getElementById('f-costi').value = p.costi || '';
  document.getElementById('f-note').value = p.note || '';
  document.getElementById('modal-progetto').classList.remove('hidden');
}

function chiudiModal() {
  document.getElementById('modal-progetto').classList.add('hidden');
  editingId = null;
}

async function salvaProgetto() {
  const oggetto = document.getElementById('f-oggetto').value.trim();
  if (!oggetto) { showToast('Inserisci il nome del progetto'); return; }

  if (editingId) {
    const p = dati.progetti.find(x => x.id === editingId);
    const vecchioStato = p.stato;
    p.societa     = document.getElementById('f-soc').value;
    p.responsabile = document.getElementById('f-resp').value;
    p.oggetto     = oggetto;
    p.obiettivo   = document.getElementById('f-obiettivo').value;
    const nuovoStato = document.getElementById('f-stato-form').value;
    if (nuovoStato !== vecchioStato) logStoria(p, 'stato', vecchioStato, nuovoStato);
    p.stato       = nuovoStato;
    p.proposta    = document.getElementById('f-proposta').value;
    p.inizio      = document.getElementById('f-inizio').value || null;
    p.scadenza    = document.getElementById('f-scadenza').value || null;
    p.strumenti   = document.getElementById('f-strumenti').value;
    p.costi       = parseFloat(document.getElementById('f-costi').value) || null;
    p.note        = document.getElementById('f-note').value;
    await salvaDati(`Progetto modificato: ${oggetto}`);
    progettoAperto = p;
  } else {
    const nuovo = {
      id: uid(),
      societa:      document.getElementById('f-soc').value,
      oggetto,
      obiettivo:    document.getElementById('f-obiettivo').value,
      responsabile: document.getElementById('f-resp').value,
      proposta:     document.getElementById('f-proposta').value,
      strumenti:    document.getElementById('f-strumenti').value,
      costi:        parseFloat(document.getElementById('f-costi').value) || null,
      inizio:       document.getElementById('f-inizio').value || null,
      scadenza:     document.getElementById('f-scadenza').value || null,
      stato:        document.getElementById('f-stato-form').value,
      note:         document.getElementById('f-note').value,
      azioni:       [],
      storia:       [{ data: oggi(), utente: currentUser, campo: 'creazione', da: '', a: document.getElementById('f-stato-form').value }],
      tags:         []
    };
    dati.progetti.push(nuovo);
    await salvaDati(`Nuovo progetto: ${oggetto}`);
  }

  chiudiModal();
  renderAll();
  if (editingId && document.getElementById('side-panel').classList.contains('hidden') === false) {
    renderPanel();
  }
}

// ============================================================
// STORIA
// ============================================================
function logStoria(p, campo, da, a) {
  if (!p.storia) p.storia = [];
  p.storia.push({ data: oggi(), utente: currentUser, campo, da, a });
}

// ============================================================
// SCADENZE E REMINDER
// ============================================================
function getScadenzeAllarme() {
  const allarmi = [];
  dati.progetti.forEach(p => {
    if (isClosed(p.stato)) return;
    const d = diffGiorni(p.scadenza);
    if (d !== null && d <= 3) {
      allarmi.push({
        tipo: d < 0 ? 'scaduta' : d === 0 ? 'oggi' : 'presto',
        titolo: p.oggetto,
        dettaglio: `Scadenza progetto: ${formatData(p.scadenza)} · ${p.responsabile}`,
        tipoLabel: 'progetto',
        id: p.id
      });
    }
    (p.azioni||[]).forEach(a => {
      if (a.completata) return;
      const da = diffGiorni(a.scadenza);
      if (da !== null && da <= 3) {
        allarmi.push({
          tipo: da < 0 ? 'scaduta' : da === 0 ? 'oggi' : 'presto',
          titolo: a.titolo,
          dettaglio: `Azione su: ${p.oggetto} · ${formatData(a.scadenza)}`,
          tipoLabel: 'azione',
          id: p.id
        });
      }
    });
  });
  return allarmi;
}

function checkBadge() {
  const n = getScadenzeAllarme().length;
  const dot = document.getElementById('badge-dot');
  if (n > 0) dot.classList.remove('hidden');
  else dot.classList.add('hidden');
}

function openAlerts() { mostraPopupScadenze(); }

function mostraPopupScadenze() {
  const allarmi = getScadenzeAllarme();
  const popup = document.getElementById('popup-scadenze');
  if (!allarmi.length) { showToast('Nessuna scadenza imminente ✓'); return; }

  document.getElementById('popup-sub').textContent = `${allarmi.length} elemento${allarmi.length>1?'i':''} da controllare`;
  document.getElementById('popup-lista').innerHTML = allarmi.map(a => `
    <div class="popup-item ${a.tipo==='scaduta'?'scaduta-p':a.tipo==='oggi'?'oggi-p':'presto-p'}" onclick="apriPanel('${a.id}');chiudiPopup()">
      <div class="pi-titolo">${a.titolo}<span class="pi-tipo ${a.tipoLabel==='azione'?'pi-az':'pi-prog'}">${a.tipoLabel}</span></div>
      <div class="pi-det">${a.dettaglio}</div>
    </div>`).join('');

  popup.classList.remove('hidden');
}

function chiudiPopup() {
  document.getElementById('popup-scadenze').classList.add('hidden');
}

function avviaReminder() {
  mostraPopupScadenze();
  if (reminderInterval) clearInterval(reminderInterval);
  reminderInterval = setInterval(() => {
    mostraPopupScadenze();
  }, 15 * 60 * 1000); // ogni 15 minuti
}

// ============================================================
// SWITCH VIEW
// ============================================================
function switchView(nome) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById(`view-${nome}`).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[data-view="${nome}"]`).classList.add('active');
  document.getElementById('filtri-bar').style.display = nome === 'dashboard' ? 'none' : '';
}

// ============================================================
// EXPORT EXCEL (CSV compatibile)
// ============================================================
function esportaExcel() {
  const filtrati = filtra(dati.progetti);
  const righe = [
    ['Società','Oggetto','Obiettivo','Responsabile','Proposta','Stato','Inizio','Scadenza','Strumenti','Costi (€)','Note','N. Azioni','Azioni aperte']
  ];
  filtrati.forEach(p => {
    righe.push([
      p.societa||'', p.oggetto||'', p.obiettivo||'', p.responsabile||'',
      p.proposta||'', p.stato||'',
      formatData(p.inizio), formatData(p.scadenza),
      p.strumenti||'', p.costi||'', (p.note||'').replace(/\n/g,' '),
      (p.azioni||[]).length,
      (p.azioni||[]).filter(a=>!a.completata).length
    ]);
  });
  const csv = righe.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url;
  a.download = `progetti_${oggi()}.csv`; a.click();
  URL.revokeObjectURL(url);
  showToast('Export completato');
}

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const savedToken = getToken();
  const tokenSection = document.getElementById('token-section');
  const tokenInput = document.getElementById('token-input');
  tokenSection.style.display = 'block';
  if (savedToken) {
    tokenInput.placeholder = 'Token salvato — incolla uno nuovo per cambiarlo';
    tokenInput.value = '';
  } else {
    tokenInput.placeholder = 'Incolla qui il token ghp_...';
  }
});
