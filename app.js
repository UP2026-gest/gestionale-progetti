// ─── CONFIG ───────────────────────────────────────────────────
const OWNER  = 'UP2026-gest';
const REPO   = 'gestionale-progetti';
const FILE   = 'progetti.json';
const BRANCH = 'main';
const TOKEN  = localStorage.getItem('gp_token') || '';
const API    = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FILE}`;

// ─── STATE ────────────────────────────────────────────────────
let utente  = null;
let DB      = { progetti: [], meta: {} };
let sha     = null;
let panel_id = null;
let edit_id  = null;
let reminder = null;

// ─── DATE UTILS ───────────────────────────────────────────────
// Tutte le date sono memorizzate come stringa "GG/MM/AAAA"
// Non usiamo mai input[type=date] per evitare problemi di formato

function oggi() {
  const d = new Date();
  return fmt(d);
}

function fmt(d) {
  if (!d) return '';
  const dd = String(d.getDate()).padStart(2,'0');
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const yy = d.getFullYear();
  return `${dd}/${mm}/${yy}`;
}

function parseData(s) {
  // Accetta "GG/MM/AAAA" o "AAAA-MM-GG"
  if (!s) return null;
  s = s.trim();
  if (s.includes('/')) {
    const [g,m,a] = s.split('/');
    if (!g||!m||!a||a.length!==4) return null;
    return new Date(parseInt(a), parseInt(m)-1, parseInt(g));
  }
  if (s.includes('-')) {
    const [a,m,g] = s.split('-');
    return new Date(parseInt(a), parseInt(m)-1, parseInt(g));
  }
  return null;
}

function validaData(s) {
  if (!s || s.trim() === '') return true; // vuota = ok
  const d = parseData(s);
  return d && !isNaN(d.getTime());
}

function diffGiorni(s) {
  const d = parseData(s);
  if (!d) return null;
  const og = new Date(); og.setHours(0,0,0,0);
  d.setHours(0,0,0,0);
  return Math.floor((d - og) / 86400000);
}

function scadCls(s, stato) {
  if (!s || isClosed(stato)) return '';
  const d = diffGiorni(s);
  if (d === null) return '';
  if (d < 0) return 'scaduta';
  if (d <= 3) return 'inscadenza';
  return '';
}

function scadLabel(s, stato) {
  if (!s) return { t:'—', c:'' };
  if (isClosed(stato)) return { t:s, c:'sd-ok' };
  const d = diffGiorni(s);
  if (d === null) return { t:s, c:'sd-ok' };
  if (d < 0)  return { t:`Scaduta ${s}`, c:'sd-danger' };
  if (d === 0) return { t:'Scade oggi', c:'sd-warn' };
  if (d <= 3)  return { t:`Fra ${d} gg`, c:'sd-warn' };
  return { t:s, c:'sd-ok' };
}


// Auto-format date: "05042026" or "0504" → "05/04/2026"
function formatDateInput(el) {
  let v = el.value.replace(/[^0-9]/g, '');
  if (v.length >= 8) {
    v = v.substr(0,8);
    el.value = v.substr(0,2) + '/' + v.substr(2,2) + '/' + v.substr(4,4);
  } else if (v.length === 6) {
    // DDMMYY → DD/MM/20YY
    el.value = v.substr(0,2) + '/' + v.substr(2,2) + '/20' + v.substr(4,2);
  }
}
function isClosed(stato) {
  return stato === 'Chiusa vinta' || stato === 'Chiusa persa';
}

// ─── MISC UTILS ───────────────────────────────────────────────
function uid() { return 'x' + Math.random().toString(36).substr(2,9); }

function toast(msg, dur=2800) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), dur);
}

function socTag(s) {
  if (!s) return `<span class="tag t-mix">—</span>`;
  if (s === 'UP') return `<span class="tag t-up">UP</span>`;
  if (s === 'MSF') return `<span class="tag t-msf">MSF</span>`;
  if (s === 'Studio Piazza') return `<span class="tag t-sp">SP</span>`;
  return `<span class="tag t-mix">${s}</span>`;
}

function statoPill(s) {
  const m = {
    'Primo contatto':'p-primo','Proposta in preparazione':'p-proposta',
    'Attesa riscontro':'p-attesa','Sospesa':'p-sospesa',
    'Chiusa vinta':'p-vinta','Chiusa persa':'p-persa'
  };
  return `<span class="pill ${m[s]||'p-primo'}">${s||'—'}</span>`;
}

function avColor(n) {
  if (n==='Renato') return '#2563eb';
  if (n==='Stefania') return '#9333ea';
  if (n==='Matteo') return '#16a34a';
  return '#6b7280';
}

// ─── LOGIN ────────────────────────────────────────────────────
function login(nome) {
  if (!localStorage.getItem('gp_token')) {
    document.getElementById('token-box').classList.remove('hidden');
    window._pendingUser = nome;
    document.getElementById('token-field').focus();
    return;
  }
  _doLogin(nome);
}

function salvaToken() {
  const t = document.getElementById('token-field').value.trim();
  if (!t.startsWith('ghp_')) { alert('Token non valido — deve iniziare con ghp_'); return; }
  localStorage.setItem('gp_token', t);
  document.getElementById('token-box').classList.add('hidden');
  document.getElementById('token-field').value = '';
  _doLogin(window._pendingUser);
}

function _doLogin(nome) {
  utente = nome;
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  const av = document.getElementById('av-hdr');
  av.textContent = nome[0];
  av.style.background = avColor(nome);
  document.getElementById('user-hdr').textContent = nome;
  carica();
}

function logout() {
  utente = null;
  clearInterval(reminder);
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
}

// ─── GITHUB I/O ───────────────────────────────────────────────
async function carica() {
  toast('Caricamento…', 10000);
  try {
    const r = await fetch(API, {
      headers: { Authorization: `token ${TOKEN}`, Accept: 'application/vnd.github.v3+json' }
    });
    if (r.status === 404) {
      // Prima volta: carica dati iniziali
      await caricaIniziali();
      return;
    }
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    sha = j.sha;
    const raw = atob(j.content.replace(/\n/g,''));
    const bytes = new Uint8Array(raw.length);
    for (let i=0;i<raw.length;i++) bytes[i] = raw.charCodeAt(i);
    DB = JSON.parse(new TextDecoder('utf-8').decode(bytes));
    toast('Dati caricati ✓');
    render();
    avviaReminder();
  } catch(e) {
    toast('Errore: ' + e.message, 5000);
    await caricaIniziali();
  }
}

async function caricaIniziali() {
  try {
    const r = await fetch('progetti_iniziali.json');
    DB = await r.json();
    sha = null;
    toast('Dati iniziali caricati');
    render();
    avviaReminder();
  } catch(e) {
    DB = { progetti:[], meta:{} };
    render();
  }
}

async function salva(msg) {
  toast('Salvataggio…', 10000);
  DB.meta.ultimo_aggiornamento = oggi();
  DB.meta.ultimo_utente = utente;
  const json = JSON.stringify(DB, null, 2);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i=0; i<bytes.length; i+=8192) {
    bin += String.fromCharCode(...bytes.subarray(i, i+8192));
  }
  const content = btoa(bin);
  const body = { message: msg || `Update by ${utente}`, content, branch: BRANCH };
  if (sha) body.sha = sha;
  try {
    const r = await fetch(API, {
      method:'PUT',
      headers:{ Authorization:`token ${TOKEN}`, Accept:'application/vnd.github.v3+json', 'Content-Type':'application/json' },
      body: JSON.stringify(body)
    });
    if (!r.ok) {
      const err = await r.json();
      if (r.status === 409) { toast('Conflitto: ricarico…',3000); setTimeout(carica,1500); return false; }
      throw new Error(err.message || r.status);
    }
    const j = await r.json();
    sha = j.content.sha;
    toast('Salvato ✓');
    return true;
  } catch(e) {
    toast('Errore salvataggio: ' + e.message, 5000);
    return false;
  }
}

// ─── FILTRI ───────────────────────────────────────────────────
function filtrati() {
  const q  = (document.getElementById('q')?.value||'').toLowerCase();
  const fs = document.getElementById('f-soc')?.value||'';
  const fr = document.getElementById('f-res')?.value||'';
  const ft = document.getElementById('f-sta')?.value||'';
  const fd = document.getElementById('f-sca')?.value||'';
  return DB.progetti.filter(p => {
    if (q && !p.oggetto.toLowerCase().includes(q) && !(p.note||'').toLowerCase().includes(q) && !(p.obiettivo||'').toLowerCase().includes(q)) return false;
    if (fs && p.societa !== fs) return false;
    if (fr && p.responsabile !== fr) return false;
    if (ft && p.stato !== ft) return false;
    if (fd) {
      const d = diffGiorni(p.scadenza);
      if (fd==='scadute'  && (d===null||d>=0)) return false;
      if (fd==='oggi'     && d!==0) return false;
      if (fd==='3g'       && (d===null||d<0||d>3)) return false;
      if (fd==='7g'       && (d===null||d<0||d>7)) return false;
      if (fd==='30g'      && (d===null||d<0||d>30)) return false;
    }
    return true;
  });
}

function resetFiltri() {
  document.getElementById('q').value='';
  document.getElementById('f-soc').value='';
  document.getElementById('f-res').value='';
  document.getElementById('f-sta').value='';
  document.getElementById('f-sca').value='';
  render();
}

// ─── RENDER ───────────────────────────────────────────────────
function render() {
  const list = filtrati();
  renderLista(list);
  renderKanban(list);
  renderDash(DB.progetti);
  aggiornaBadge();
}

function renderLista(list) {
  const body = document.getElementById('lista-body');
  if (!list.length) {
    body.innerHTML = `<div class="empty"><svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/></svg><h3>Nessun progetto trovato</h3><p>Modifica i filtri o aggiungi un nuovo progetto</p></div>`;
    return;
  }
  body.innerHTML = list.map(p => {
    const cls = scadCls(p.scadenza, p.stato);
    const sl  = scadLabel(p.scadenza, p.stato);
    const azT = (p.azioni||[]).length;
    const azA = (p.azioni||[]).filter(a=>!a.completata).length;
    return `<div class="row ${cls} ${isClosed(p.stato)?'chiusa':''}" onclick="apriPanel('${p.id}')">
      <div>${socTag(p.societa)}</div>
      <div><div class="row-nome">${p.oggetto}</div><div class="row-obj">${p.obiettivo||''}</div></div>
      <div style="font-size:13px">${p.responsabile||'—'}</div>
      <div>${statoPill(p.stato)}</div>
      <div><span class="${sl.c}">${sl.t}</span></div>
      <div>${azT>0?`<span class="az-badge ${azA>0?'open':''}">${azA}/${azT}</span>`:`<span class="az-badge">—</span>`}</div>
    </div>`;
  }).join('');
}

const STATI = ['Primo contatto','Proposta in preparazione','Attesa riscontro','Sospesa','Chiusa vinta','Chiusa persa'];

function renderKanban(list) {
  document.getElementById('kanban').innerHTML = STATI.map(s => {
    const col = list.filter(p=>p.stato===s);
    return `<div class="k-col">
      <div class="k-col-hdr"><span>${s}</span><span class="k-cnt">${col.length}</span></div>
      ${col.length===0?'<div style="font-size:12px;color:var(--txt3);text-align:center;padding:12px 0">Nessuno</div>':
        col.map(p=>{
          const cls=scadCls(p.scadenza,p.stato);
          return `<div class="k-card ${cls}" onclick="apriPanel('${p.id}')">
            <div class="k-nome">${p.oggetto}</div>
            <div class="k-info">${p.societa||''} · ${p.responsabile||''}</div>
            <div class="k-scad">${p.scadenza||'—'}</div>
          </div>`;
        }).join('')}
    </div>`;
  }).join('');
}

const COLORS = ['#2563eb','#9333ea','#16a34a','#ea580c','#ca8a04','#dc2626'];

function renderDash(list) {
  const tot   = list.length;
  const att   = list.filter(p=>!isClosed(p.stato)).length;
  const vinte = list.filter(p=>p.stato==='Chiusa vinta').length;
  const scad  = list.filter(p=>!isClosed(p.stato)&&diffGiorni(p.scadenza)!==null&&diffGiorni(p.scadenza)<0).length;
  const wr    = tot>0?Math.round(vinte/tot*100):0;
  const perSt = STATI.map(s=>({s,n:list.filter(p=>p.stato===s).length}));
  const maxSt = Math.max(...perSt.map(x=>x.n),1);
  const resp  = ['Renato','Stefania','Matteo','Tutti'].map(r=>({r,n:list.filter(p=>p.responsabile===r).length})).filter(x=>x.n>0);

  document.getElementById('dashboard').innerHTML = `
  <div class="dash-stats">
    <div class="stat"><div class="stat-lbl">Totale</div><div class="stat-val">${tot}</div></div>
    <div class="stat"><div class="stat-lbl">Attivi</div><div class="stat-val">${att}</div></div>
    <div class="stat"><div class="stat-lbl">Chiusi vinti</div><div class="stat-val" style="color:var(--ok)">${vinte}</div></div>
    <div class="stat"><div class="stat-lbl">Scaduti</div><div class="stat-val" style="color:var(--danger)">${scad}</div></div>
    <div class="stat"><div class="stat-lbl">Win rate</div><div class="stat-val">${wr}%</div></div>
  </div>
  <div class="dash-box"><h3>Per stato</h3>
    ${perSt.map((x,i)=>`<div class="bar-row"><div class="bar-lbl">${statoPill(x.s)}</div><div class="bar-track"><div class="bar-fill" style="width:${Math.round(x.n/maxSt*100)}%;background:${COLORS[i]}"></div></div><div class="bar-n">${x.n}</div></div>`).join('')}
  </div>
  <div class="dash-box"><h3>Per responsabile</h3>
    ${resp.map(x=>`<div class="bar-row"><div class="bar-lbl" style="font-size:13px">${x.r}</div><div class="bar-track"><div class="bar-fill" style="width:${tot>0?Math.round(x.n/tot*100):0}%;background:${avColor(x.r)}"></div></div><div class="bar-n">${x.n}</div></div>`).join('')}
  </div>`;
}

// ─── VIEWS ────────────────────────────────────────────────────
function setView(v, btn) {
  document.querySelectorAll('.view').forEach(el=>el.classList.add('hidden'));
  document.getElementById('view-'+v).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelector('.filtri').style.display = v==='dashboard'?'none':'';
}

// ─── PANEL ────────────────────────────────────────────────────
function apriPanel(id) {
  panel_id = id;
  document.getElementById('panel-overlay').classList.remove('hidden');
  document.getElementById('panel').classList.remove('hidden');
  renderPanel();
}

function chiudiPanel() {
  panel_id = null;
  document.getElementById('panel-overlay').classList.add('hidden');
  document.getElementById('panel').classList.add('hidden');
}

function renderPanel() {
  const p = DB.progetti.find(x=>x.id===panel_id);
  if (!p) return;
  const azioni = p.azioni||[];
  const storia = p.storia||[];
  document.getElementById('panel-inner').innerHTML = `
  <div class="p-hdr">
    <div><div class="p-soc">${p.societa||''}</div><div class="p-titolo">${p.oggetto}</div></div>
    <div style="display:flex;gap:6px;align-items:center">
      <button class="sm-btn del" onclick="eliminaProgetto('${p.id}')" title="Elimina progetto">🗑</button>
      <button class="x-btn" onclick="chiudiPanel()">✕</button>
    </div>
  </div>

  <div class="p-section">
    <div class="p-section-title">Dettagli <button class="sm-btn" onclick="apriForm('${p.id}')">Modifica</button></div>
    <div class="p-grid">
      <div class="p-field"><label>Responsabile</label><div class="val">${p.responsabile||'—'}</div></div>
      <div class="p-field"><label>Stato</label><div class="val">${statoPill(p.stato)}</div></div>
      <div class="p-field"><label>Proposta</label><div class="val">${p.proposta||'—'}</div></div>
      <div class="p-field"><label>Scadenza</label><div class="val"><span class="${scadLabel(p.scadenza,p.stato).c}">${scadLabel(p.scadenza,p.stato).t}</span></div></div>
      <div class="p-field"><label>Inizio</label><div class="val">${p.inizio||'—'}</div></div>
      <div class="p-field"><label>Strumenti</label><div class="val">${p.strumenti||'—'}</div></div>
      ${p.costi?`<div class="p-field"><label>Costi</label><div class="val">€ ${p.costi.toLocaleString()}</div></div>`:''}
      <div class="p-field full"><label>Obiettivo</label><div class="val">${p.obiettivo||'—'}</div></div>
    </div>
  </div>

  <div class="p-section">
    <div class="p-section-title">Note</div>
    <div id="note-view">
      <div style="font-size:13px;color:var(--txt2);margin-bottom:8px">${p.note||'<em>Nessuna nota</em>'}</div>
      <button class="sm-btn" onclick="toggleNota(true)">Aggiorna nota</button>
    </div>
    <div id="note-edit" style="display:none">
      <textarea id="nota-input" rows="3" style="width:100%;padding:8px;border:1.5px solid var(--brd);border-radius:6px;font-family:var(--font);font-size:13px;resize:vertical;margin-bottom:7px">${p.note||''}</textarea>
      <div class="form-btns">
        <button class="sm-btn-s" onclick="toggleNota(false)">Annulla</button>
        <button class="sm-btn-p" onclick="salvaNota('${p.id}')">Salva</button>
      </div>
    </div>
  </div>

  <div class="p-section">
    <div class="p-section-title">Azioni <button class="sm-btn" onclick="toggleFormAzione(true)">+ Aggiungi</button></div>
    <div id="form-azione" style="display:none" class="inline-form">
      <input type="text" id="az-tit" placeholder="Descrizione azione *">
      <div class="irow">
        <input type="text" id="az-sca" placeholder="Scadenza GG/MM/AAAA" maxlength="10" onblur="formatDateInput(this)">
        <input type="text" id="az-res" placeholder="Responsabile">
      </div>
      <textarea id="az-not" rows="2" placeholder="Note (opzionale)"></textarea>
      <div class="form-btns">
        <button class="sm-btn-s" onclick="toggleFormAzione(false)">Annulla</button>
        <button class="sm-btn-p" onclick="aggiungiAzione('${p.id}')">Aggiungi</button>
      </div>
    </div>
    <div id="azioni-list">
      ${azioni.length===0?'<div style="font-size:13px;color:var(--txt3);padding:8px 0">Nessuna azione</div>':azioni.map(a=>renderAzione(a,p.id)).join('')}
    </div>
  </div>

  <div class="p-section">
    <div class="p-section-title">Storico modifiche</div>
    ${storia.length===0?'<div style="font-size:13px;color:var(--txt3)">Nessuna modifica registrata</div>':
      [...storia].reverse().map(s=>`
      <div class="storia-item"><div class="s-dot"></div><div>
        <div class="s-txt"><strong>${s.utente||'?'}</strong> — ${s.campo}${s.da?`: <s style="color:var(--txt3)">${s.da}</s> → ${s.a}`:`: ${s.a}`}</div>
        <div class="s-data">${s.data||''}</div>
      </div></div>`).join('')}
  </div>`;
}

function renderAzione(a, pid) {
  const d = diffGiorni(a.scadenza);
  const cls = !a.completata && a.scadenza && d!==null && d<0 ? 'scaduta-az' : '';
  return `<div class="az-item ${a.completata?'completata':''} ${cls}" id="az-${a.id}">
    <div class="az-top">
      <div class="az-chk ${a.completata?'done':''}" onclick="toggleAz('${pid}','${a.id}')">${a.completata?'✓':''}</div>
      <div class="az-tit ${a.completata?'done-txt':''}">${a.titolo}</div>
      ${a.scadenza?`<div class="az-scad-lbl">${a.scadenza}</div>`:''}
    </div>
    ${a.note?`<div class="az-note">${a.note}</div>`:''}
    <div class="az-meta">Da ${a.creato_da||'?'} · ${a.creato_il||''}</div>
    <div class="az-btns">
      <button class="sm-btn" onclick="editAz('${pid}','${a.id}')">Modifica</button>
      <button class="sm-btn del" onclick="delAz('${pid}','${a.id}')">Elimina</button>
    </div>
  </div>`;
}

function toggleNota(show) {
  document.getElementById('note-view').style.display = show?'none':'';
  document.getElementById('note-edit').style.display = show?'':'none';
  if (show) document.getElementById('nota-input').focus();
}

function toggleFormAzione(show) {
  document.getElementById('form-azione').style.display = show?'':'none';
  if (show) document.getElementById('az-tit').focus();
}

// ─── NOTE ─────────────────────────────────────────────────────
async function salvaNota(pid) {
  const p = DB.progetti.find(x=>x.id===pid);
  if (!p) return;
  const v = document.getElementById('nota-input').value;
  log(p,'nota',p.note,v);
  p.note = v;
  await salva(`Nota: ${p.oggetto}`);
  renderPanel(); render();
}

// ─── AZIONI ───────────────────────────────────────────────────
async function aggiungiAzione(pid) {
  const tit = document.getElementById('az-tit').value.trim();
  if (!tit) { toast('Inserisci la descrizione'); return; }
  const scaRaw = document.getElementById('az-sca').value.trim();
  if (scaRaw && !validaData(scaRaw)) { toast('Data non valida (usa GG/MM/AAAA)'); return; }
  const p = DB.progetti.find(x=>x.id===pid);
  if (!p) return;
  if (!p.azioni) p.azioni=[];
  p.azioni.push({
    id:uid(), titolo:tit,
    scadenza: scaRaw || null,
    responsabile: document.getElementById('az-res').value||utente,
    note: document.getElementById('az-not').value||'',
    completata:false, creato_da:utente, creato_il:oggi()
  });
  log(p,'azione aggiunta','',tit);
  await salva(`Azione aggiunta: ${p.oggetto}`);
  renderPanel(); render();
}

async function toggleAz(pid, aid) {
  const p = DB.progetti.find(x=>x.id===pid);
  const a = p.azioni.find(x=>x.id===aid);
  a.completata = !a.completata;
  log(p,'azione',a.titolo,a.completata?'completata':'riaperta');
  await salva(`Azione ${a.completata?'completata':'riaperta'}: ${p.oggetto}`);
  renderPanel(); render();
}

function editAz(pid, aid) {
  const p = DB.progetti.find(x=>x.id===pid);
  const a = p.azioni.find(x=>x.id===aid);
  document.getElementById(`az-${aid}`).innerHTML = `
    <input type="text" id="eaz-tit" value="${a.titolo}" style="width:100%;padding:7px 9px;border:1.5px solid var(--brd);border-radius:6px;font-family:var(--font);font-size:13px;margin-bottom:7px;outline:none">
    <div class="irow" style="margin-bottom:7px">
      <input type="text" id="eaz-sca" value="${a.scadenza||''}" placeholder="GG/MM/AAAA" maxlength="10" onblur="formatDateInput(this)" style="flex:1;padding:7px 9px;border:1.5px solid var(--brd);border-radius:6px;font-family:var(--font);font-size:13px;outline:none">
      <input type="text" id="eaz-res" value="${a.responsabile||''}" placeholder="Responsabile" style="flex:1;padding:7px 9px;border:1.5px solid var(--brd);border-radius:6px;font-family:var(--font);font-size:13px;outline:none">
    </div>
    <textarea id="eaz-not" rows="2" style="width:100%;padding:7px 9px;border:1.5px solid var(--brd);border-radius:6px;font-family:var(--font);font-size:13px;resize:vertical;margin-bottom:7px;outline:none">${a.note||''}</textarea>
    <div class="form-btns">
      <button class="sm-btn-s" onclick="renderPanel()">Annulla</button>
      <button class="sm-btn-p" onclick="salvaAz('${pid}','${aid}')">Salva</button>
    </div>`;
}

async function salvaAz(pid, aid) {
  const scaRaw = document.getElementById('eaz-sca').value.trim();
  if (scaRaw && !validaData(scaRaw)) { toast('Data non valida (usa GG/MM/AAAA)'); return; }
  const p = DB.progetti.find(x=>x.id===pid);
  const a = p.azioni.find(x=>x.id===aid);
  a.titolo = document.getElementById('eaz-tit').value.trim()||a.titolo;
  a.scadenza = scaRaw||null;
  a.responsabile = document.getElementById('eaz-res').value||a.responsabile;
  a.note = document.getElementById('eaz-not').value;
  await salva(`Azione modificata: ${p.oggetto}`);
  renderPanel(); render();
}

async function delAz(pid, aid) {
  if (!confirm('Eliminare questa azione?')) return;
  const p = DB.progetti.find(x=>x.id===pid);
  const a = p.azioni.find(x=>x.id===aid);
  log(p,'azione eliminata',a.titolo,'');
  p.azioni = p.azioni.filter(x=>x.id!==aid);
  await salva(`Azione eliminata: ${p.oggetto}`);
  renderPanel(); render();
}

// ─── FORM PROGETTO ────────────────────────────────────────────
function apriForm(id) {
  edit_id = id;
  document.getElementById('modal-title').textContent = id ? 'Modifica progetto' : 'Nuovo progetto';
  const p = id ? DB.progetti.find(x=>x.id===id) : null;
  document.getElementById('m-soc').value = p?.societa||'UP';
  document.getElementById('m-res').value = p?.responsabile||utente;
  document.getElementById('m-ogg').value = p?.oggetto||'';
  document.getElementById('m-obj').value = p?.obiettivo||'';
  document.getElementById('m-sta').value = p?.stato||'Primo contatto';
  document.getElementById('m-pro').value = p?.proposta||'No';
  document.getElementById('m-ini').value = p?.inizio||'';
  document.getElementById('m-sca').value = p?.scadenza||'';
  document.getElementById('m-str').value = p?.strumenti||'';
  document.getElementById('m-cos').value = p?.costi||'';
  document.getElementById('m-not').value = p?.note||'';
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal').classList.remove('hidden');
  document.getElementById('m-ogg').focus();
}

function chiudiForm() {
  edit_id = null;
  document.getElementById('modal-overlay').classList.add('hidden');
  document.getElementById('modal').classList.add('hidden');
}

async function salvaProgetto() {
  const ogg = document.getElementById('m-ogg').value.trim();
  if (!ogg) { document.getElementById('m-ogg').classList.add('err'); toast('Inserisci il nome del progetto'); return; }
  document.getElementById('m-ogg').classList.remove('err');

  const iniRaw = document.getElementById('m-ini').value.trim();
  const scaRaw = document.getElementById('m-sca').value.trim();

  if (iniRaw && !validaData(iniRaw)) { toast('Data inizio non valida (usa GG/MM/AAAA)'); return; }
  if (scaRaw && !validaData(scaRaw)) { toast('Scadenza non valida (usa GG/MM/AAAA)'); return; }

  if (edit_id) {
    const p = DB.progetti.find(x=>x.id===edit_id);
    const oldStato = p.stato;
    p.societa      = document.getElementById('m-soc').value;
    p.responsabile = document.getElementById('m-res').value;
    p.oggetto      = ogg;
    p.obiettivo    = document.getElementById('m-obj').value;
    const newStato = document.getElementById('m-sta').value;
    if (newStato !== oldStato) log(p,'stato',oldStato,newStato);
    p.stato        = newStato;
    p.proposta     = document.getElementById('m-pro').value;
    p.inizio       = iniRaw||null;
    p.scadenza     = scaRaw||null;
    p.strumenti    = document.getElementById('m-str').value;
    p.costi        = parseFloat(document.getElementById('m-cos').value)||null;
    p.note         = document.getElementById('m-not').value;
    await salva(`Modificato: ${ogg}`);
    chiudiForm();
    // Aggiorna panel se aperto
    if (panel_id === edit_id) renderPanel();
  } else {
    const p = {
      id:uid(),
      societa:      document.getElementById('m-soc').value,
      oggetto:      ogg,
      obiettivo:    document.getElementById('m-obj').value,
      responsabile: document.getElementById('m-res').value,
      proposta:     document.getElementById('m-pro').value,
      strumenti:    document.getElementById('m-str').value,
      costi:        parseFloat(document.getElementById('m-cos').value)||null,
      inizio:       iniRaw||null,
      scadenza:     scaRaw||null,
      stato:        document.getElementById('m-sta').value,
      note:         document.getElementById('m-not').value,
      azioni:[], storia:[{data:oggi(),utente,campo:'creazione',da:'',a:document.getElementById('m-sta').value}], tags:[]
    };
    DB.progetti.push(p);
    await salva(`Nuovo: ${ogg}`);
    chiudiForm();
  }
  render();
}

async function eliminaProgetto(id) {
  if (!confirm("Eliminare definitivamente questo progetto? L'operazione non può essere annullata.")) return;
  DB.progetti = DB.progetti.filter(x => x.id !== id);
  await salva('Progetto eliminato');
  chiudiPanel();
  render();
}

// ─── STORIA ───────────────────────────────────────────────────
function log(p, campo, da, a) {
  if (!p.storia) p.storia=[];
  p.storia.push({ data:oggi(), utente, campo, da, a });
}

// ─── ALLARMI ──────────────────────────────────────────────────
function getAllarmi() {
  const out = [];
  DB.progetti.forEach(p => {
    if (isClosed(p.stato)) return;
    const d = diffGiorni(p.scadenza);
    if (d!==null && d<=3) out.push({ tipo:d<0?'sc':d===0?'og':'pr', tit:p.oggetto, det:`Scadenza: ${p.scadenza} · ${p.responsabile}`, label:'progetto', id:p.id });
    (p.azioni||[]).forEach(a => {
      if (a.completata) return;
      const da = diffGiorni(a.scadenza);
      if (da!==null && da<=3) out.push({ tipo:da<0?'sc':da===0?'og':'pr', tit:a.titolo, det:`Azione su: ${p.oggetto} · ${a.scadenza}`, label:'azione', id:p.id });
    });
  });
  return out;
}

function aggiornaBadge() {
  const n = getAllarmi().length;
  const b = document.getElementById('allarmi-badge');
  n>0 ? b.classList.remove('hidden') : b.classList.add('hidden');
}

function mostraAllarmi() {
  const al = getAllarmi();
  const pop = document.getElementById('popup');
  if (!al.length) { toast('Nessuna scadenza imminente ✓'); return; }
  document.getElementById('popup-sub').textContent = `${al.length} elemento${al.length>1?'i':''} da controllare`;
  document.getElementById('popup-list').innerHTML = al.map(a=>`
    <div class="popup-item ${a.tipo}" onclick="apriPanel('${a.id}');chiudiPopup()">
      <div class="pi-tit">${a.tit}<span class="pi-tipo ${a.label==='azione'?'ti-az':'ti-pr'}">${a.label}</span></div>
      <div class="pi-det">${a.det}</div>
    </div>`).join('');
  pop.classList.remove('hidden');
}

function chiudiPopup() { document.getElementById('popup').classList.add('hidden'); }

function avviaReminder() {
  mostraAllarmi();
  clearInterval(reminder);
  reminder = setInterval(mostraAllarmi, 15*60*1000);
}

// ─── EXPORT ───────────────────────────────────────────────────
function esporta() {
  const list = filtrati();
  const rows = [['Società','Progetto','Obiettivo','Responsabile','Proposta','Stato','Inizio','Scadenza','Costi','Note','Azioni tot','Azioni aperte']];
  list.forEach(p => rows.push([
    p.societa||'',p.oggetto||'',p.obiettivo||'',p.responsabile||'',p.proposta||'',p.stato||'',
    p.inizio||'',p.scadenza||'',p.costi||'',(p.note||'').replace(/\n/g,' '),
    (p.azioni||[]).length,(p.azioni||[]).filter(a=>!a.completata).length
  ]));
  const csv = rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));
  a.download = `progetti_${oggi().replace(/\//g,'-')}.csv`;
  a.click();
  toast('Export completato');
}
