/* ═══════════════════════════════════════════════
   MailBlast — app.js  (v4)
   • Template (subj + body) per dataset
   • Link builder: teks → hyperlink di body email
   • Dynamic columns
═══════════════════════════════════════════════ */

// ── HARDCODED CONFIG ───────────────────────────
const GAS_URL = "https://script.google.com/macros/s/AKfycbxwQoyjGlkZIg1w2eCcgUMmzAznkI4OGp6EZUhP809sCUeoL_xZDvprav2lGIR8W4y00g/exec";

// ── STATE ──────────────────────────────────────
let TOKEN = null;
const SK = 'mb_v4';

const DEFAULT_COLS = [
  { key: 'nama',  label: 'Nama',  placeholder: 'Masukkan nama...', isEmail: false },
  { key: 'email', label: 'Email', placeholder: 'email@domain.com', isEmail: true  }
];

// Per-dataset structure:
// { name, cols, rows, tpl: { subj, body, links: [{text, url}] } }
let S = {
  datasets: {},
  active: null,
  cfg: { delay: 2, skip: true }
};

let _editingCols = [];
let _editingDsKey = null;
let _newDsName    = '';

// ── HELPERS ────────────────────────────────────
function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function save() { localStorage.setItem(SK, JSON.stringify(S)); }

// ── API (GET — no CORS preflight) ─────────────
async function api(params) {
  params.token = TOKEN;
  const url = GAS_URL + '?' + new URLSearchParams(params).toString();
  const res = await fetch(url);
  return await res.json();
}

// ── LOGIN ──────────────────────────────────────
async function doLogin() {
  const t = document.getElementById('tokenInp').value.trim();
  if (!t) { errLogin('Token tidak boleh kosong.'); return; }
  setBusy(true);
  TOKEN = t;
  try {
    const d = await api({ action: 'verify' });
    if (d.status === 'success') {
      hideErr();
      fadeOut('loginScreen', () => { fadeIn('appScreen'); initApp(); });
    } else {
      TOKEN = null; errLogin('Token salah. Akses ditolak.'); shake();
    }
  } catch (e) {
    TOKEN = null; errLogin('Tidak bisa terhubung. Periksa koneksi & URL GAS.');
  }
  setBusy(false);
}

function setBusy(on) {
  document.getElementById('loginBtn').disabled = on;
  document.getElementById('spinner').style.display = on ? 'block' : 'none';
  document.getElementById('loginBtnTxt').textContent = on ? 'Memverifikasi...' : 'Verifikasi & Masuk';
}
function errLogin(m) { document.getElementById('loginErrMsg').textContent = m; document.getElementById('loginErr').classList.add('show'); }
function hideErr()   { document.getElementById('loginErr').classList.remove('show'); }
function shake() { const i = document.getElementById('tokenInp'); i.classList.add('shake'); setTimeout(() => i.classList.remove('shake'), 400); }
function toggleEye() { const i = document.getElementById('tokenInp'); i.type = i.type === 'password' ? 'text' : 'password'; document.getElementById('eyeBtn').textContent = i.type === 'password' ? '👁' : '🙈'; }

function doLogout() { TOKEN = null; fadeOut('appScreen', () => { document.getElementById('tokenInp').value = ''; fadeIn('loginScreen'); }); }
function fadeOut(id, cb) { const el = document.getElementById(id); el.style.transition = 'opacity 0.35s'; el.style.opacity = '0'; setTimeout(() => { el.style.display = 'none'; el.style.opacity = ''; if (cb) cb(); }, 360); }
function fadeIn(id)  { const el = document.getElementById(id); el.style.opacity = '0'; el.style.display = id === 'loginScreen' ? 'flex' : 'block'; el.style.transition = 'opacity 0.35s'; setTimeout(() => el.style.opacity = '1', 10); }

// ── INIT ───────────────────────────────────────
function initApp() {
  try { const p = JSON.parse(localStorage.getItem(SK) || '{}'); S = { ...S, ...p }; } catch (e) {}
  if (!S.datasets) S.datasets = {};
  if (!S.cfg) S.cfg = { delay: 2, skip: true };

  document.getElementById('delay').value   = S.cfg.delay || 2;
  document.getElementById('skipSent').value = S.cfg.skip !== false ? 'true' : 'false';

  // Modal overlay click-to-close
  document.querySelectorAll('.mo').forEach(el => {
    el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
  });

  renderDs();
  if (S.active && S.datasets[S.active]) setDs(S.active);
  else updateChips();
}

// ── ACTIVE DATASET TEMPLATE ────────────────────
function getDsTpl() {
  if (!S.active || !S.datasets[S.active]) return { subj: '', body: '', links: [] };
  return S.datasets[S.active].tpl || { subj: '', body: '', links: [] };
}

function loadTplToUI() {
  const tpl = getDsTpl();
  document.getElementById('subj').value = tpl.subj || '';
  document.getElementById('body').value = tpl.body || '';
  renderLinkList();
}

function saveTpl() {
  if (!S.active || !S.datasets[S.active]) return;
  const ds = S.datasets[S.active];
  if (!ds.tpl) ds.tpl = { subj: '', body: '', links: [] };
  ds.tpl.subj = document.getElementById('subj').value;
  ds.tpl.body = document.getElementById('body').value;
  save();
}

// ── LINK MANAGER ───────────────────────────────
function getLinks() {
  return getDsTpl().links || [];
}

function saveLinks(links) {
  if (!S.active || !S.datasets[S.active]) return;
  const ds = S.datasets[S.active];
  if (!ds.tpl) ds.tpl = { subj: '', body: '', links: [] };
  ds.tpl.links = links;
  save();
}

function renderLinkList() {
  const area = document.getElementById('linkListArea');
  const links = getLinks();
  if (!S.active) { area.innerHTML = '<span style="font-size:11px;color:var(--text-muted)">Pilih dataset terlebih dahulu.</span>'; return; }
  if (!links.length) { area.innerHTML = '<span style="font-size:11px;color:var(--text-muted)">Belum ada link. Klik + Tambah Link.</span>'; return; }

  area.innerHTML = links.map((lnk, i) => `
    <div class="link-row" id="linkrow-${i}">
      <div class="link-row-fields">
        <input class="col-inp" type="text"
          placeholder="Teks tampilan (misal: klik di sini)"
          value="${esc(lnk.text)}"
          oninput="updateLink(${i},'text',this.value)"
          title="Teks yang akan diklik">
        <input class="col-inp" type="url"
          placeholder="https://contoh.com/link"
          value="${esc(lnk.url)}"
          oninput="updateLink(${i},'url',this.value)"
          title="URL tujuan link">
      </div>
      <div class="link-row-actions">
        <button class="btn btn-g btn-sm" onclick="insertLink(${i})" title="Sisipkan ke body email">⬆ Sisipkan</button>
        <button class="ico-btn del" onclick="removeLink(${i})" title="Hapus link">✕</button>
      </div>
      <div class="link-preview-row">
        <span class="link-preview-label">Placeholder:</span>
        <code class="link-ph-badge">{{link_${i}}}</code>
        <span class="link-preview-label" style="margin-left:8px">Preview:</span>
        <a class="link-preview-anchor" href="${esc(lnk.url)}" target="_blank" rel="noopener">${esc(lnk.text) || '(teks kosong)'}</a>
      </div>
    </div>
  `).join('');
}

function addLink() {
  if (!S.active) { toast('Pilih dataset dulu', 'error'); return; }
  const links = getLinks();
  links.push({ text: '', url: '' });
  saveLinks(links);
  renderLinkList();
  // Focus text input of new link
  setTimeout(() => {
    const rows = document.querySelectorAll('#linkListArea .link-row');
    if (rows.length) rows[rows.length - 1].querySelector('.col-inp')?.focus();
  }, 50);
}

function updateLink(i, field, val) {
  const links = getLinks();
  if (!links[i]) return;
  links[i][field] = val;
  saveLinks(links);
  // Live-update the preview without full re-render
  const row = document.getElementById('linkrow-' + i);
  if (row) {
    const anchor = row.querySelector('.link-preview-anchor');
    if (anchor) {
      anchor.textContent = links[i].text || '(teks kosong)';
      anchor.href        = links[i].url || '#';
    }
  }
}

function removeLink(i) {
  const links = getLinks();
  links.splice(i, 1);
  saveLinks(links);
  renderLinkList();
}

// Insert link placeholder {{link_N}} at cursor in body textarea
function insertLink(i) {
  const ta  = document.getElementById('body');
  const ph  = `{{link_${i}}}`;
  const s   = ta.selectionStart;
  const e   = ta.selectionEnd;
  ta.value  = ta.value.slice(0, s) + ph + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + ph.length;
  ta.focus();
  saveTpl();
  toast(`Placeholder {{link_${i}}} disisipkan`, 'success');
}

// ── TEMPLATE ───────────────────────────────────
// Insert column placeholder at cursor
function ins(ph) {
  const ta = document.getElementById('body');
  const s  = ta.selectionStart, e = ta.selectionEnd;
  ta.value = ta.value.slice(0, s) + ph + ta.value.slice(e);
  ta.selectionStart = ta.selectionEnd = s + ph.length;
  ta.focus();
  saveTpl();
}

function updateChips() {
  const area = document.getElementById('chipArea');
  if (!S.active || !S.datasets[S.active]) {
    area.innerHTML = `<span style="font-size:11px;color:var(--text-muted)">Pilih dataset untuk melihat placeholder.</span>`;
    return;
  }
  const cols = S.datasets[S.active].cols || DEFAULT_COLS;
  area.innerHTML = cols.map(c =>
    `<div class="chip" onclick="ins('{{${c.key}}}')" title="Sisipkan ${esc(c.label)}">{{${c.key}}}</div>`
  ).join('');
}

// Apply template to one row: replace column + link placeholders
function applyTpl(row) {
  const cols  = getCols();
  const links = getLinks();

  const rep = str => {
    let out = str || '';
    // Replace column placeholders
    cols.forEach(c => {
      out = out.replace(new RegExp(`\\{\\{${c.key}\\}\\}`, 'g'), row[c.key] || '');
    });
    // Replace link placeholders → HTML anchor tags
    links.forEach((lnk, i) => {
      const anchor = `<a href="${lnk.url}" style="color:#4f8ef7">${lnk.text || lnk.url}</a>`;
      out = out.replace(new RegExp(`\\{\\{link_${i}\\}\\}`, 'g'), anchor);
    });
    return out;
  };

  return { subject: rep(getDsTpl().subj), body: rep(getDsTpl().body) };
}

// ── DATASET ────────────────────────────────────
function renderDs() {
  const el   = document.getElementById('dsList');
  const keys = Object.keys(S.datasets);
  if (!keys.length) {
    el.innerHTML = `<div style="padding:20px;text-align:center;font-size:12px;color:var(--text-muted)">Belum ada dataset</div>`;
    return;
  }
  el.innerHTML = keys.map(k => {
    const d = S.datasets[k], n = d.rows ? d.rows.length : 0;
    const colCount = d.cols ? d.cols.length : 0;
    return `<div class="ds-item ${k === S.active ? 'active' : ''}" onclick="setDs('${k}')">
      <div class="ds-ico">${emoji(k)}</div>
      <div class="ds-info">
        <div class="ds-name">${esc(d.name)}</div>
        <div class="ds-cnt">${n} baris · ${colCount} kolom</div>
      </div>
      <div class="ds-acts">
        <button class="ico-btn" onclick="editCols(event,'${k}')" title="Kelola Kolom">⚙</button>
        <button class="ico-btn del" onclick="delDs(event,'${k}')" title="Hapus">🗑</button>
      </div>
    </div>`;
  }).join('');
}

function emoji(k) {
  const e = ['📚','🎓','👨‍👩‍👧','📋','🏫','👥','📝','🌟'];
  let h = 0; for (let c of k) h += c.charCodeAt(0);
  return e[h % e.length];
}

function showAddDs() {
  document.getElementById('dsName').value = '';
  openM('mAddDs');
  setTimeout(() => document.getElementById('dsName').focus(), 100);
}

function confirmDs() {
  const n = document.getElementById('dsName').value.trim();
  if (!n) { toast('Nama tidak boleh kosong', 'error'); return; }
  _editingDsKey = '__new__';
  _newDsName    = n;
  _editingCols  = deepCopy(DEFAULT_COLS);
  closeM('mAddDs');
  openColManager();
}

function setDs(k) {
  // Save current template before switching
  if (S.active && S.active !== k) saveTpl();

  S.active = k;
  save();
  renderDs(); renderTbl(); updStats(); updateChips();
  loadTplToUI();          // load this dataset's template
  document.getElementById('tblTitle').textContent   = S.datasets[k]?.name || '';
  document.getElementById('dsTplName').textContent  = S.datasets[k]?.name || '—';
  document.getElementById('sendBtn').disabled   = false;
  document.getElementById('colMgrBtn').disabled = false;
}

function delDs(e, k) {
  e.stopPropagation();
  if (!confirm(`Hapus dataset "${S.datasets[k]?.name}"?`)) return;
  delete S.datasets[k];
  if (S.active === k) {
    S.active = null;
    emptyTbl();
    document.getElementById('tblTitle').textContent   = 'Pilih Dataset';
    document.getElementById('sendBtn').disabled       = true;
    document.getElementById('colMgrBtn').disabled     = true;
    document.getElementById('dsTplName').textContent  = '— pilih dataset —';
    document.getElementById('subj').value = '';
    document.getElementById('body').value = '';
    document.getElementById('body').value = '';
    updateChips();
    renderLinkList();
  }
  save(); renderDs();
  toast('Dataset dihapus', 'info');
}

// ── COLUMN MANAGER ─────────────────────────────
function editCols(e, k) {
  e.stopPropagation();
  _editingDsKey = k;
  _editingCols  = deepCopy(S.datasets[k].cols || DEFAULT_COLS);
  openColManager();
}

function showColManager() {
  if (!S.active) return;
  editCols({ stopPropagation: () => {} }, S.active);
}

function openColManager() { renderColList(); openM('mColMgr'); }

function renderColList() {
  const el = document.getElementById('colList');
  if (!_editingCols.length) {
    el.innerHTML = `<div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px">Belum ada kolom. Klik + Tambah Kolom.</div>`;
    return;
  }
  el.innerHTML = _editingCols.map((col, i) => {
    const ph = col.key ? `{{${col.key}}}` : '—';
    return `<div class="col-row ${col.isEmail ? 'is-email' : ''}" id="colrow-${i}">
      <div>
        <input class="col-inp" type="text"
          placeholder="Nama kolom (tampilan)"
          value="${esc(col.label)}"
          oninput="updateColLabel(${i}, this.value)"
          title="Nama kolom yang ditampilkan di tabel">
        <span class="col-placeholder">${ph}</span>
      </div>
      <input class="col-inp" type="text"
        placeholder="Placeholder input (opsional)"
        value="${esc(col.placeholder || '')}"
        oninput="updateColPlaceholder(${i}, this.value)"
        title="Teks placeholder saat sel masih kosong">
      <label class="col-email-toggle ${col.isEmail ? 'active' : ''}" title="Tandai sebagai kolom email tujuan">
        <input type="checkbox" ${col.isEmail ? 'checked' : ''} onchange="toggleEmailCol(${i}, this.checked)">
        📧
      </label>
      <button class="ico-btn del" onclick="removeCol(${i})" title="Hapus kolom">✕</button>
    </div>`;
  }).join('');
}

function labelToKey(label) {
  return label.trim().toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '')
    || 'kolom_' + Date.now();
}

function updateColLabel(i, val) {
  _editingCols[i].label = val;
  _editingCols[i].key   = labelToKey(val);
  const row  = document.getElementById('colrow-' + i);
  const span = row?.querySelector('.col-placeholder');
  if (span) span.textContent = val.trim() ? `{{${_editingCols[i].key}}}` : '—';
}

function updateColPlaceholder(i, val) { _editingCols[i].placeholder = val; }

function toggleEmailCol(i, checked) {
  if (checked) _editingCols.forEach((c, idx) => { c.isEmail = (idx === i); });
  else         _editingCols[i].isEmail = false;
  renderColList();
}

function removeCol(i) { _editingCols.splice(i, 1); renderColList(); }

function addCol() {
  _editingCols.push({ key: '', label: '', placeholder: '', isEmail: false });
  renderColList();
  setTimeout(() => {
    const rows = document.querySelectorAll('#colList .col-row');
    if (rows.length) rows[rows.length - 1].querySelector('.col-inp')?.focus();
  }, 50);
}

function saveCols() {
  const filled = _editingCols.filter(c => c.label.trim() && c.key);
  if (!filled.length)          { toast('Minimal satu kolom harus diisi', 'error'); return; }
  if (!filled.some(c=>c.isEmail)) { toast('Tandai minimal satu kolom sebagai 📧 Email', 'error'); return; }
  const keys = filled.map(c => c.key);
  if (new Set(keys).size !== keys.length) { toast('Nama kolom ada yang sama!', 'error'); return; }

  if (_editingDsKey === '__new__') {
    const k = 'ds_' + Date.now();
    S.datasets[k] = { name: _newDsName, cols: filled, rows: [], tpl: { subj: '', body: '', links: [] } };
    save(); renderDs(); setDs(k);
    toast(`Dataset "${_newDsName}" berhasil dibuat`, 'success');
  } else {
    const ds     = S.datasets[_editingDsKey];
    const oldCols = ds.cols || [];
    ds.rows = ds.rows.map(row => {
      const newRow = { _status: row._status || 'pending' };
      filled.forEach(col => { newRow[col.key] = oldCols.find(oc => oc.key === col.key) ? (row[col.key] || '') : ''; });
      return newRow;
    });
    ds.cols = filled;
    save(); renderDs();
    if (S.active === _editingDsKey) { renderTbl(); updateChips(); }
    toast('Kolom berhasil diperbarui', 'success');
  }
  closeM('mColMgr');
}

// ── TABLE ──────────────────────────────────────
function emptyTbl() {
  document.getElementById('tblWrap').innerHTML = `
    <div class="empty">
      <div class="empty-ico">📂</div>
      <div class="empty-t">Belum ada dataset</div>
      <div class="empty-d">Buat dataset baru dari sidebar.</div>
      <button class="btn btn-p btn-sm" onclick="showAddDs()">＋ Buat Dataset</button>
    </div>`;
}

function getCols()     { if (!S.active||!S.datasets[S.active]) return DEFAULT_COLS; return S.datasets[S.active].cols||DEFAULT_COLS; }
function getEmailKey() { return (getCols().find(c=>c.isEmail)||{}).key||'email'; }

function renderTbl() {
  if (!S.active || !S.datasets[S.active]) { emptyTbl(); return; }
  const ds   = S.datasets[S.active];
  const cols = ds.cols || DEFAULT_COLS;
  const rows = ds.rows || [];
  const span = cols.length + 3;

  let h = `<table><thead><tr>
    <th style="width:36px">#</th>
    ${cols.map(c => `<th>${esc(c.label)}</th>`).join('')}
    <th style="width:100px">Status</th>
    <th style="width:40px"></th>
  </tr></thead><tbody>`;

  if (!rows.length) {
    h += `<tr><td colspan="${span}" style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px">Klik "＋ Baris" untuk menambah data.</td></tr>`;
  } else {
    rows.forEach((row, i) => {
      h += `<tr>
        <td class="rn">${i+1}</td>
        ${cols.map(c => `<td><input type="${c.isEmail?'email':'text'}" value="${esc(row[c.key]||'')}" placeholder="${esc(c.placeholder||c.label)}" onchange="upd(${i},'${c.key}',this.value)"></td>`).join('')}
        <td class="sc">${sbadge(row._status)}</td>
        <td class="ac"><button class="ico-btn del" onclick="delRow(${i})" title="Hapus baris">✕</button></td>
      </tr>`;
    });
  }
  h += `</tbody></table><button class="add-row" onclick="addRow()">＋ Tambah Baris</button>`;
  document.getElementById('tblWrap').innerHTML = h;
}

function sbadge(s) { const m={pending:'Pending',sending:'Mengirim...',sent:'Terkirim',failed:'Gagal'}; const c=m[s]?s:'pending'; return `<span class="sb ${c}"><span class="sd"></span>${m[c]||'Pending'}</span>`; }

function addRow() {
  if (!S.active) { toast('Pilih dataset dulu','error'); return; }
  const newRow = { _status:'pending' };
  getCols().forEach(c => { newRow[c.key]=''; });
  S.datasets[S.active].rows.push(newRow);
  save(); renderTbl(); updStats();
}

function delRow(i) { S.datasets[S.active].rows.splice(i,1); save(); renderTbl(); updStats(); }
function upd(i,field,val) { S.datasets[S.active].rows[i][field]=val; save(); updStats(); }

// ── PREVIEW ────────────────────────────────────
let pi=0, pr=[];

function showPreview() {
  if (!S.active) { toast('Pilih dataset dulu','error'); return; }
  const emailKey = getEmailKey();
  pr = (S.datasets[S.active].rows||[]).filter(r=>r[emailKey]);
  if (!pr.length) { toast('Tidak ada baris dengan email valid','error'); return; }
  pi=0; renderPrev(); openM('mPreview');
}

function renderPrev() {
  const emailKey = getEmailKey();
  const row      = pr[pi];
  const { subject, body } = applyTpl(row);

  document.getElementById('pTo').textContent   = row[emailKey] || '—';
  document.getElementById('pSubj').textContent = subject || '(kosong)';

  const pBody = document.getElementById('pBody');
  if (!body) {
    pBody.innerHTML = '<span style="color:var(--text-muted)">(kosong)</span>';
    return;
  }

  // applyTpl sudah menghasilkan HTML anchor (<a href="...">teks</a>).
  // Kita perlu:
  //   1. Escape teks biasa agar tidak merusak HTML
  //   2. Tapi JANGAN escape tag <a> yang sudah dihasilkan applyTpl
  //
  // Cara aman: split body pada anchor tags, escape bagian teks,
  // biarkan anchor tags apa adanya, lalu gabung kembali.
  const anchorRe = /(<a\s[^>]*>[\s\S]*?<\/a>)/g;
  const parts    = body.split(anchorRe);

  const html = parts.map((part, idx) => {
    if (idx % 2 === 1) {
      // Ini adalah anchor tag hasil applyTpl — tampilkan apa adanya
      return part;
    }
    // Ini teks biasa — escape HTML lalu ubah newline → <br>
    return part
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }).join('');

  pBody.innerHTML = html;
  document.getElementById('pCtr').textContent = `${pi + 1}/${pr.length}`;
}

function prevP() { if (pi>0)              { pi--; renderPrev(); } }
function nextP() { if (pi<pr.length-1)    { pi++; renderPrev(); } }

// ── CONFIG ─────────────────────────────────────
function saveCfg() {
  S.cfg.delay = parseInt(document.getElementById('delay').value);
  S.cfg.skip  = document.getElementById('skipSent').value === 'true';
  save();
}

function copyGas() {
  navigator.clipboard.writeText(document.getElementById('gasCode').textContent)
    .then(()=>toast('Kode GAS disalin','success'));
}

// ── SEND ───────────────────────────────────────
function getRowsToSend() {
  if (!S.active) return [];
  const emailKey = getEmailKey();
  return (S.datasets[S.active].rows||[]).filter(r => {
    if (!r[emailKey]||!validEmail(r[emailKey])) return false;
    if (S.cfg.skip&&r._status==='sent')          return false;
    return true;
  });
}

function showConfirm() {
  if (!S.active) { toast('Pilih dataset dulu','error'); return; }
  const rows = getRowsToSend();
  if (!rows.length) { toast('Tidak ada email valid untuk dikirim','error'); return; }
  const d=S.cfg.delay, sec=rows.length*d;
  document.getElementById('cTotal').textContent = rows.length;
  document.getElementById('cDelay').textContent = d+'s';
  document.getElementById('cEst').textContent   = sec<60?`~${sec} detik`:`~${Math.ceil(sec/60)} menit`;
  const tot=S.datasets[S.active].rows.length, skip=tot-rows.length;
  document.getElementById('cNote').innerHTML    = `Dataset: <strong>${esc(S.datasets[S.active].name)}</strong>`+(skip>0?` · ${skip} baris dilewati`:'');
  openM('mConfirm');
}

async function startSend() {
  closeM('mConfirm'); tab('stats');
  saveTpl(); // ensure latest template is saved
  const ds       = S.datasets[S.active];
  const allRows  = ds.rows;
  const emailKey = getEmailKey();
  const delay    = S.cfg.delay * 1000;
  document.getElementById('sendBtn').disabled = true;
  log('Mulai kirim: '+ds.name,'info');
  let sent=0, fail=0, skip=0;

  for (let i=0; i<allRows.length; i++) {
    const row      = allRows[i];
    const emailVal = row[emailKey];

    if (!emailVal||!validEmail(emailVal)) { log(`Baris ${i+1}: email invalid → lewati`,'warn'); skip++; prog(sent,fail,skip,allRows.length); continue; }
    if (S.cfg.skip&&row._status==='sent') { skip++; prog(sent,fail,skip,allRows.length); continue; }

    allRows[i]._status = 'sending';
    save(); renderTbl();

    const { subject, body } = applyTpl(row);

    try {
      const d = await api({ action:'send', to:emailVal, subject, body });
      if (d.status==='success') { allRows[i]._status='sent';   sent++; log(`✓ ${emailVal}`,'ok');  }
      else                      { allRows[i]._status='failed'; fail++; log(`✕ ${emailVal} — ${d.message}`,'err'); }
    } catch(e) {                  allRows[i]._status='failed'; fail++; log(`✕ ${emailVal} — ${e.message}`,'err'); }

    save(); renderTbl(); prog(sent,fail,skip,allRows.length);
    if (i<allRows.length-1) await sleep(delay);
  }

  document.getElementById('sendBtn').disabled = false;
  log(`Selesai. ${sent} terkirim · ${fail} gagal · ${skip} dilewati`,'info');
  toast(`Selesai! ${sent} terkirim, ${fail} gagal`, sent>0?'success':'error');
}

function prog(s,f,sk,t) { const d=s+f+sk,pct=t?Math.round(d/t*100):0; document.getElementById('pFill').style.width=pct+'%'; document.getElementById('pPct').textContent=pct+'%'; document.getElementById('pStat').textContent=`${d}/${t} · ${s} terkirim · ${f} gagal`; updStats(); }
function sleep(ms)       { return new Promise(r=>setTimeout(r,ms)); }
function validEmail(e)   { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }

// ── STATS & LOG ────────────────────────────────
function updStats() {
  if (!S.active) { ['sTotal','sSent','sFail','sPend'].forEach(id=>document.getElementById(id).textContent='0'); return; }
  const r = S.datasets[S.active].rows||[];
  document.getElementById('sTotal').textContent = r.length;
  document.getElementById('sSent').textContent  = r.filter(x=>x._status==='sent').length;
  document.getElementById('sFail').textContent  = r.filter(x=>x._status==='failed').length;
  document.getElementById('sPend').textContent  = r.filter(x=>!x._status||x._status==='pending').length;
}

function resetStatus() {
  if (!S.active) return;
  S.datasets[S.active].rows.forEach(r=>r._status='pending');
  save(); renderTbl(); updStats();
  document.getElementById('pFill').style.width='0%';
  document.getElementById('pPct').textContent='0%';
  document.getElementById('pStat').textContent='Direset';
  toast('Status direset ke Pending','info');
}

function log(m,t='info') { const la=document.getElementById('logArea'),now=new Date().toTimeString().slice(0,8),d=document.createElement('div'); d.className='ll'; d.innerHTML=`<span class="lt">${now}</span><span class="lm ${t}">${m}</span>`; la.appendChild(d); la.scrollTop=la.scrollHeight; }
function clearLog() { document.getElementById('logArea').innerHTML=''; }

// ── CSV ────────────────────────────────────────
function exportCSV() {
  if (!S.active) { toast('Pilih dataset dulu','error'); return; }
  const ds=S.datasets[S.active], cols=ds.cols||DEFAULT_COLS, rows=ds.rows||[];
  let csv = cols.map(c=>`"${c.label.replace(/"/g,'""')}"`).join(',') + '\n';
  rows.forEach(row => { csv += cols.map(c=>`"${(row[c.key]||'').replace(/"/g,'""')}"`).join(',') + '\n'; });
  Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})),
    download: (ds.name||'data')+'.csv'
  }).click();
  toast('Data diekspor ke CSV','success');
}

function importCSV(e) {
  if (!S.active) { toast('Pilih dataset dulu','error'); return; }
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    const lines=ev.target.result.split('\n').filter(l=>l.trim());
    if (lines.length<2) { toast('File CSV kosong atau tidak valid','error'); return; }
    const ds=S.datasets[S.active], cols=ds.cols||DEFAULT_COLS;
    const headerCells=parseCSVLine(lines[0]);
    const colMap=headerCells.map(h=>{ const t=h.trim(); return (cols.find(c=>c.label.toLowerCase()===t.toLowerCase()||c.key.toLowerCase()===t.toLowerCase())||{}).key||null; });
    let n=0;
    lines.slice(1).forEach(line=>{
      const cells=parseCSVLine(line);
      const newRow={_status:'pending'};
      cols.forEach(c=>{newRow[c.key]='';});
      cells.forEach((val,i)=>{ if(colMap[i]) newRow[colMap[i]]=val.trim(); });
      ds.rows.push(newRow); n++;
    });
    save(); renderTbl(); updStats();
    toast(`${n} baris berhasil diimpor`,'success');
  };
  reader.readAsText(file);
  e.target.value='';
}

function parseCSVLine(line) { const r=[];let cur='',inQ=false; for(const ch of line){if(ch==='"')inQ=!inQ;else if(ch===','&&!inQ){r.push(cur);cur='';}else cur+=ch;} r.push(cur); return r; }

// ── UI HELPERS ─────────────────────────────────
function tab(n) {
  document.querySelectorAll('.tab-btn').forEach((b,i)=>b.classList.toggle('active',['tpl','stats','cfg'][i]===n));
  document.querySelectorAll('.tab-pane').forEach(p=>p.classList.toggle('active',p.id==='tab-'+n));
}
function openM(id)  { document.getElementById(id).classList.add('open'); }
function closeM(id) { document.getElementById(id).classList.remove('open'); }
function toast(m,t='info') { const c=document.getElementById('toastC'),d=document.createElement('div'); d.className=`toast ${t}`; d.innerHTML=`<span>${{success:'✓',error:'✕',info:'ℹ'}[t]||'·'}</span><span>${m}</span>`; c.appendChild(d); setTimeout(()=>d.remove(),3500); }
