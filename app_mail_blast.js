/* ═══════════════════════════════════════════════
   MailBlast — app.js  (v4)
   • Template (subj + body) per dataset
   • Link builder: teks → hyperlink di body email
   • Dynamic columns
═══════════════════════════════════════════════ */

// ── HARDCODED CONFIG ───────────────────────────
// Ganti URL di bawah dengan URL deployment GAS Write (v9 + MailBlast) yang baru
const GAS_URL = "https://script.google.com/macros/s/AKfycbw9dQmCy9JaiDWby3xG5L71UvZCfcJp9LsroKBmUWte94cv472tW9k1_8u1lQuq82DQ/exec";
// Token harus sama dengan WRITE_TOKEN di GAS (saat ini: 'oka')

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

// ── LOGIN — identik dengan index_input.html ──────
async function doLogin() {
  const inp  = document.getElementById('tokenInp');
  const btn  = document.getElementById('loginBtn');
  const stat = document.getElementById('loginErr');
  const card = document.getElementById('lovTokenCard');
  if (!inp || !btn) return;

  const val = inp.value.trim();
  if (!val) {
    stat.className = 'lov-token-status err';
    stat.textContent = 'Token tidak boleh kosong';
    inp.focus(); return;
  }

  btn.disabled = true;
  document.getElementById('spinner').style.display = 'block';
  document.getElementById('loginBtnTxt').textContent = 'Memverifikasi…';
  stat.className = 'lov-token-status wait';
  stat.textContent = 'Memverifikasi…';

  TOKEN = val;
  try {
    const d = await api({ action: 'verify' });
    if (d.status === 'success') {
      stat.className = 'lov-token-status ok';
      stat.textContent = '✓  Akses diberikan';
      card.classList.add('confirmed');
      setTimeout(() => {
        const lov = document.getElementById('lov');
        if (lov) { lov.style.transition = 'opacity .5s ease'; lov.style.opacity = '0'; setTimeout(() => { lov.style.display = 'none'; }, 520); }
        const app = document.getElementById('appScreen');
        if (app) { app.style.display = 'block'; }
        initApp();
      }, 600);
    } else {
      TOKEN = null;
      btn.disabled = false;
      document.getElementById('spinner').style.display = 'none';
      document.getElementById('loginBtnTxt').textContent = 'Konfirmasi';
      stat.className = 'lov-token-status err';
      stat.textContent = '✕  Token salah, coba lagi';
      inp.value = ''; inp.focus();
      _shakeCard();
    }
  } catch (e) {
    TOKEN = null;
    btn.disabled = false;
    document.getElementById('spinner').style.display = 'none';
    document.getElementById('loginBtnTxt').textContent = 'Konfirmasi';
    stat.className = 'lov-token-status err';
    stat.textContent = '✕  ' + (e.message || 'Gagal terhubung');
    inp.focus();
  }
}

function _shakeCard() {
  const card = document.getElementById('lovTokenCard');
  if (!card) return;
  card.style.transition = 'transform .08s ease';
  card.style.transform = 'translateX(-7px)';
  setTimeout(() => { card.style.transform = 'translateX(7px)'; }, 80);
  setTimeout(() => { card.style.transform = 'translateX(-4px)'; }, 160);
  setTimeout(() => { card.style.transform = ''; card.style.transition = ''; }, 240);
}

function toggleEye() {
  const i = document.getElementById('tokenInp');
  const e = document.getElementById('eyeBtn');
  if (!i) return;
  i.type = i.type === 'password' ? 'text' : 'password';
  if (e) e.textContent = i.type === 'password' ? '👁' : '🙈';
}

function doLogout() {
  TOKEN = null;
  const app = document.getElementById('appScreen');
  const lov = document.getElementById('lov');
  const card = document.getElementById('lovTokenCard');
  const inp  = document.getElementById('tokenInp');
  const stat = document.getElementById('loginErr');
  if (app) { app.style.transition = 'opacity .35s'; app.style.opacity = '0'; setTimeout(() => { app.style.display = 'none'; app.style.opacity = ''; }, 360); }
  if (inp)  inp.value = '';
  if (stat) { stat.className = 'lov-token-status'; stat.textContent = ''; }
  if (card) card.classList.remove('confirmed');
  if (lov)  { lov.style.display = 'flex'; lov.style.opacity = '0'; lov.style.transition = 'opacity .35s'; setTimeout(() => lov.style.opacity = '1', 10); }
  document.getElementById('loginBtnTxt').textContent = 'Konfirmasi';
  const btn = document.getElementById('loginBtn'); if (btn) btn.disabled = false;
  document.getElementById('spinner').style.display = 'none';
}

// ── INIT ───────────────────────────────────────
function initApp() {
  try { const p = JSON.parse(localStorage.getItem(SK) || '{}'); S = { ...S, ...p }; } catch (e) {}
  if (!S.datasets) S.datasets = {};
  if (!S.cfg) S.cfg = { delay: 2, skip: true };

  // Normalisasi dataset lama ─ tambah field yang mungkin belum ada
  Object.values(S.datasets).forEach(ds => {
    if (!ds.tpl) ds.tpl = { subj: '', body: '', links: [] };
    if (!ds.cols) ds.cols = deepCopy(DEFAULT_COLS);

    // Pastikan ada tepat satu kolom isEmail
    const hasEmail = ds.cols.some(c => c.isEmail);
    if (!hasEmail) {
      // Cari kolom yang keynya mengandung 'email'
      const emailCol = ds.cols.find(c => c.key.toLowerCase().includes('email'));
      if (emailCol) emailCol.isEmail = true;
      else ds.cols.push({ key:'email', label:'Email', placeholder:'email@domain.com', isEmail:true });
    }

    // Pastikan semua baris punya _selected (data lama tidak punya)
    if (ds.rows) ds.rows.forEach(r => {
      if (r._selected === undefined) r._selected = true;
    });
  });

  document.getElementById('delay').value   = S.cfg.delay || 2;
  document.getElementById('skipSent').value = S.cfg.skip !== false ? 'true' : 'false';

  // Modal overlay click-to-close
  document.querySelectorAll('.mo').forEach(el => {
    el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
  });

  save(); // simpan kembali data yang sudah dinormalisasi
  renderDs();
  if (S.active && S.datasets[S.active]) setDs(S.active);
  else updateChips();
  initMobile();
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

  const rep = (str, isBody) => {
    let out = str || '';
    // Ganti placeholder kolom — escape HTML chars dari nilai data
    cols.forEach(c => {
      const val = (row[c.key] || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
      out = out.replace(new RegExp(`\\{\\{${c.key}\\}\\}`, 'g'), val);
    });
    // Ganti placeholder link → anchor HTML
    links.forEach((lnk, i) => {
      const href = lnk.url || '#';
      const txt  = lnk.text || href;
      // Anchor dengan spasi eksplisit dan style inline
      const anchor = '<a href="' + href + '" style="color:#4f8ef7;text-decoration:underline">' + txt + '</a>';
      out = out.replace(new RegExp(`\\{\\{link_${i}\\}\\}`, 'g'), anchor);
    });
    // Untuk body: convert newline → <br> di sisi client, bukan di GAS
    if (isBody) out = out.replace(/\n/g, '<br>');
    return out;
  };

  return { subject: rep(getDsTpl().subj, false), body: rep(getDsTpl().body, true) };
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
      const newRow = { _status: row._status || 'pending', _selected: row._selected !== false };
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

function getColWidths() {
  if (!S.active || !S.datasets[S.active]) return {};
  return S.datasets[S.active].colWidths || {};
}

function setColWidth(key, w) {
  if (!S.active || !S.datasets[S.active]) return;
  if (!S.datasets[S.active].colWidths) S.datasets[S.active].colWidths = {};
  S.datasets[S.active].colWidths[key] = w;
  save();
}

function resetColWidths() {
  if (!S.active || !S.datasets[S.active]) return;
  S.datasets[S.active].colWidths = {};
  save(); renderTbl();
  toast('Lebar kolom direset', 'info');
}

function renderTbl() {
  if (!S.active || !S.datasets[S.active]) { emptyTbl(); return; }
  const ds   = S.datasets[S.active];
  const cols = ds.cols || DEFAULT_COLS;
  const rows = ds.rows || [];
  const span = cols.length + 4;
  const widths = getColWidths();

  const total    = rows.length;
  const selCount = rows.filter(r => r._selected !== false).length;
  const allChk   = total > 0 && selCount === total;
  const someChk  = selCount > 0 && selCount < total;

  let h = `<table id="mainTbl" style="table-layout:fixed"><colgroup>
    <col style="width:36px">
    <col style="width:32px">
    ${cols.map(c => `<col data-key="${esc(c.key)}" style="width:${widths[c.key]||160}px">`).join('')}
    <col style="width:110px">
    <col style="width:40px">
  </colgroup><thead><tr>
    <th style="width:36px">
      <input type="checkbox" id="chkAll"
        ${allChk ? 'checked' : ''}
        onchange="selectAll(this.checked)"
        title="Pilih/batal semua"
        style="cursor:pointer;width:15px;height:15px;accent-color:var(--pm)">
    </th>
    <th style="width:32px">#</th>
    ${cols.map(c => `<th class="th-resizable" data-key="${esc(c.key)}" style="width:${widths[c.key]||160}px">
      <span class="th-label">${esc(c.label)}</span>
      <span class="col-resize-handle" onmousedown="initResize(event,'${esc(c.key)}')" title="Seret untuk ubah lebar"></span>
    </th>`).join('')}
    <th style="width:110px">Status</th>
    <th style="width:40px"></th>
  </tr></thead><tbody>`;

  if (!rows.length) {
    h += `<tr><td colspan="${span}" style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px">Klik "＋ Baris" untuk menambah data.</td></tr>`;
  } else {
    rows.forEach((row, i) => {
      const sel = row._selected !== false;
      h += `<tr class="${sel ? '' : 'row-unsel'}">
        <td style="padding:0 0 0 12px;width:36px;vertical-align:middle">
          <input type="checkbox" ${sel ? 'checked' : ''}
            onchange="toggleSelect(${i},this.checked)"
            style="cursor:pointer;width:15px;height:15px;accent-color:var(--pm)">
        </td>
        <td class="rn">${i+1}</td>
        ${cols.map(c => `<td style="width:${widths[c.key]||160}px;max-width:${widths[c.key]||160}px"><input type="text" value="${esc(row[c.key]||'')}" placeholder="${esc(c.placeholder||c.label)}" onchange="upd(${i},'${c.key}',this.value)" ${c.isEmail?'class="email-cell"':''}></td>`).join('')}
        <td class="sc">${sbadge(row._status)}</td>
        <td class="ac"><button class="ico-btn del" onclick="delRow(${i})" title="Hapus baris">✕</button></td>
      </tr>`;
    });
  }
  h += `</tbody></table><button class="add-row" onclick="addRow()">＋ Tambah Baris</button>`;
  document.getElementById('tblWrap').innerHTML = h;

  const chkAll = document.getElementById('chkAll');
  if (chkAll) chkAll.indeterminate = someChk;
  _updateSelLabel();
}

// ── COLUMN RESIZE ──────────────────────────────
let _resizeState = null;

function initResize(e, colKey) {
  e.preventDefault();
  e.stopPropagation();
  const th = e.target.closest('th');
  const startX   = e.clientX;
  const startW   = th.offsetWidth;

  _resizeState = { colKey, startX, startW };

  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';

  // Highlight kolom aktif
  th.classList.add('resizing');

  function onMove(ev) {
    if (!_resizeState) return;
    const diff = ev.clientX - _resizeState.startX;
    const newW = Math.max(80, _resizeState.startW + diff);

    // Update col element dan th secara langsung (tanpa re-render)
    const tbl = document.getElementById('mainTbl');
    if (tbl) {
      const col = tbl.querySelector(`col[data-key="${_resizeState.colKey}"]`);
      if (col) col.style.width = newW + 'px';
      const thEl = tbl.querySelector(`th[data-key="${_resizeState.colKey}"]`);
      if (thEl) thEl.style.width = newW + 'px';
      // Update td cells
      tbl.querySelectorAll(`td:nth-child(${_getColIndex(_resizeState.colKey)})`).forEach(td => {
        td.style.width = newW + 'px';
        td.style.maxWidth = newW + 'px';
      });
    }
    _resizeState._currentW = newW;
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    if (_resizeState) {
      const th2 = document.querySelector(`th[data-key="${_resizeState.colKey}"]`);
      if (th2) th2.classList.remove('resizing');
      if (_resizeState._currentW) {
        setColWidth(_resizeState.colKey, _resizeState._currentW);
      }
      _resizeState = null;
    }
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function _getColIndex(colKey) {
  if (!S.active || !S.datasets[S.active]) return -1;
  const cols = S.datasets[S.active].cols || DEFAULT_COLS;
  const idx  = cols.findIndex(c => c.key === colKey);
  // +3 karena: checkbox(1) + nomor(2) + kolom data mulai dari 3
  return idx >= 0 ? idx + 3 : -1;
}

function _updateSelLabel() {
  if (!S.active || !S.datasets[S.active]) return;
  const rows = S.datasets[S.active].rows || [];
  const sel  = rows.filter(r => r._selected !== false).length;
  // Update sendBtn label jika ada seleksi
  const btn = document.getElementById('sendBtn');
  if (btn && rows.length) {
    btn.textContent = sel === rows.length
      ? '▶ Kirim Email'
      : `▶ Kirim (${sel})`;
  }
}

function toggleSelect(i, val) {
  if (!S.active || !S.datasets[S.active]) return;
  S.datasets[S.active].rows[i]._selected = val;
  save();
  // Update class tr langsung tanpa full re-render (lebih cepat)
  const trs = document.querySelectorAll('#tblWrap tbody tr');
  if (trs[i]) trs[i].className = val ? '' : 'row-unsel';
  // Update header checkbox
  const rows     = S.datasets[S.active].rows;
  const total    = rows.length;
  const selCount = rows.filter(r => r._selected !== false).length;
  const chkAll   = document.getElementById('chkAll');
  if (chkAll) {
    chkAll.checked       = selCount === total && total > 0;
    chkAll.indeterminate = selCount > 0 && selCount < total;
  }
  _updateSelLabel();
  updStats();
}

function selectAll(val) {
  if (!S.active || !S.datasets[S.active]) return;
  S.datasets[S.active].rows.forEach(r => { r._selected = val; });
  save(); renderTbl(); updStats();
}

function sbadge(s) { const m={pending:'Pending',sending:'Mengirim...',sent:'Terkirim',failed:'Gagal'}; const c=m[s]?s:'pending'; return `<span class="sb ${c}"><span class="sd"></span>${m[c]||'Pending'}</span>`; }

function addRow() {
  if (!S.active) { toast('Pilih dataset dulu','error'); return; }
  const newRow = { _status:'pending', _selected:true };
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
  pr = (S.datasets[S.active].rows||[]).filter(r=>r._selected!==false && r[emailKey]);
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

  // body sudah full HTML dari applyTpl (anchor + <br>) — langsung set innerHTML
  pBody.innerHTML = body;
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
    if (r._selected === false) return false;           // dikeluarkan user
    if (!r[emailKey]||!validEmail((r[emailKey]||'').trim())) return false;
    if (S.cfg.skip&&r._status==='sent')          return false;
    return true;
  });
}

function showConfirm() {
  if (!S.active) { toast('Pilih dataset dulu','error'); return; }
  let rows = getRowsToSend();

  // Jika kosong karena semua sudah 'sent' dan skip=true, tawarkan kirim ulang
  if (!rows.length && S.cfg.skip) {
    const emailKey = getEmailKey();
    const allValid = (S.datasets[S.active].rows||[]).filter(r =>
      r._selected !== false && validEmail((r[emailKey]||'').trim())
    );
    if (allValid.length > 0) {
      if (confirm(`Semua ${allValid.length} email sudah pernah terkirim.\n\nKirim ulang ke semua penerima?`)) {
        allValid.forEach(r => { r._status = 'pending'; });
        save(); renderTbl(); updStats();
        rows = getRowsToSend();
      } else { return; }
    } else { toast('Tidak ada email valid untuk dikirim','error'); return; }
  } else if (!rows.length) { toast('Tidak ada email valid untuk dikirim','error'); return; }
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
  if (isMobile()) mobPanel('right');
  saveTpl();
  const ds       = S.datasets[S.active];
  const emailKey = getEmailKey();
  const delay    = S.cfg.delay * 1000;
  const toSend   = getRowsToSend();
  const allRows  = ds.rows;
  document.getElementById('sendBtn').disabled = true;
  log('Mulai kirim: '+ds.name+' ('+toSend.length+' penerima)','info');

  // Ambil template MENTAH (sebelum placeholder diganti) untuk dokumentasi
  const _now = new Date();
  const waktuMulai = _now.getFullYear() + '-'
    + String(_now.getMonth()+1).padStart(2,'0') + '-'
    + String(_now.getDate()).padStart(2,'0') + ' '
    + String(_now.getHours()).padStart(2,'0') + ':'
    + String(_now.getMinutes()).padStart(2,'0');
  const tplMentah  = getDsTpl();
  const subjekDok  = tplMentah.subj || '';
  const bodyDok    = tplMentah.body || '';

  let sent=0, fail=0, skip=0;
  const emailBerhasil = [];
  const emailGagal    = [];

  for (let i=0; i<toSend.length; i++) {
    const row      = toSend[i];
    const emailVal = (row[emailKey] || '').trim();
    const origIdx  = allRows.indexOf(row);

    if (S.cfg.skip && row._status==='sent') { skip++; prog(sent,fail,skip,toSend.length); continue; }

    if (origIdx >= 0) { allRows[origIdx]._status = 'sending'; }
    save(); renderTbl();

    const { subject, body } = applyTpl(row);

    try {
      const d = await api({ action:'send', to:emailVal, subject, body });
      if (d.status==='success') {
        if (origIdx>=0) allRows[origIdx]._status='sent';
        sent++; emailBerhasil.push(emailVal);
        log(`✓ ${emailVal}`,'ok');
      } else {
        if (origIdx>=0) allRows[origIdx]._status='failed';
        fail++; emailGagal.push(emailVal);
        log(`✕ ${emailVal} — ${d.message}`,'err');
      }
    } catch(e) {
      if (origIdx>=0) allRows[origIdx]._status='failed';
      fail++; emailGagal.push(emailVal);
      log(`✕ ${emailVal} — ${e.message}`,'err');
    }

    save(); renderTbl(); prog(sent,fail,skip,toSend.length);
    if (i<toSend.length-1) await sleep(delay);
  }

  document.getElementById('sendBtn').disabled = false;
  log(`Selesai. ${sent} terkirim · ${fail} gagal · ${skip} dilewati`,'info');
  toast(`Selesai! ${sent} terkirim, ${fail} gagal`, sent>0?'success':'error');

  // Simpan dokumentasi ke sheet dokumentasi_email (hanya jika ada yang dikirim)
  if (sent > 0 || fail > 0) {
    try {
      await api({
        action:  'insert',
        sheet:   'dokumentasi_email',
        payload: JSON.stringify({
          rows: [{
            waktu_kirim:      waktuMulai,
            dataset:          ds.name || '',
            subjek:           subjekDok,
            isi_email:        bodyDok,
            jumlah_berhasil:  sent,
            jumlah_gagal:     fail,
            email_berhasil:   emailBerhasil.join(', '),
            email_gagal:      emailGagal.join(', '),
          }]
        })
      });
      log('📋 Dokumentasi tersimpan ke sheet dokumentasi_email','info');
    } catch(e) {
      log('⚠ Gagal simpan dokumentasi: ' + e.message,'err');
    }
  }
}

function prog(s,f,sk,t) { const d=s+f+sk,pct=t?Math.round(d/t*100):0; document.getElementById('pFill').style.width=pct+'%'; document.getElementById('pPct').textContent=pct+'%'; document.getElementById('pStat').textContent=`${d}/${t} · ${s} terkirim · ${f} gagal`; updStats(); }
function sleep(ms)       { return new Promise(r=>setTimeout(r,ms)); }
function validEmail(e)   { const v = String(e||'').trim(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v); }

// ── STATS & LOG ────────────────────────────────
function updStats() {
  if (!S.active) { ['sTotal','sSent','sFail','sPend'].forEach(id=>document.getElementById(id).textContent='0'); return; }
  const r = S.datasets[S.active].rows||[];
  const sel = r.filter(x=>x._selected!==false);
  document.getElementById('sTotal').textContent = sel.length + (sel.length < r.length ? '/'+r.length : '');
  document.getElementById('sSent').textContent  = sel.filter(x=>x._status==='sent').length;
  document.getElementById('sFail').textContent  = sel.filter(x=>x._status==='failed').length;
  document.getElementById('sPend').textContent  = sel.filter(x=>!x._status||x._status==='pending').length;
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
      const newRow={_status:'pending',_selected:true};
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

/* ════ IMPORT DARI GOOGLE SHEETS ════ */
// Kolom sheet anggota yang dikenali
const ANGGOTA_COLS = [
  { key:'nama',       label:'Nama',         placeholder:'Nama lengkap',       isEmail:false },
  { key:'kelas',      label:'Kelas',         placeholder:'cth: XI IPA A',       isEmail:false },
  { key:'angkatan',   label:'Angkatan',      placeholder:'cth: 12',             isEmail:false },
  { key:'status',     label:'Status',        placeholder:'aktif / alumni',      isEmail:false },
  { key:'no_hp',      label:'No HP',         placeholder:'08xxxxxxxxxx',        isEmail:false },
  { key:'email',      label:'Email',         placeholder:'email@domain.com',    isEmail:true  },
  { key:'catatan',    label:'Catatan',       placeholder:'Catatan tambahan',    isEmail:false },
  { key:'nama_ortu',  label:'Nama Ortu',     placeholder:'Nama orang tua',      isEmail:false },
  { key:'no_hp_ortu', label:'No HP Ortu',    placeholder:'08xxxxxxxxxx',        isEmail:false },
  { key:'email_ortu', label:'Email Ortu',    placeholder:'email@domain.com',    isEmail:true  },
];

function showImportSheets() {
  const status = document.getElementById('isStatus');
  if (status) { status.style.display = 'none'; status.textContent = ''; }
  const btn = document.getElementById('isBtn');
  if (btn) { btn.disabled = false; btn.textContent = '📥 Import Sekarang'; }
  // Default nama dataset
  const nameEl = document.getElementById('isName');
  if (nameEl && !nameEl.value) nameEl.value = 'Anggota ' + new Date().getFullYear();
  openM('mImportSheets');
}

async function doImportSheets() {
  const nameEl   = document.getElementById('isName');
  const urlEl    = document.getElementById('isUrl');
  const statusEl = document.getElementById('isStatus');
  const btn      = document.getElementById('isBtn');

  const dsName = (nameEl?.value || '').trim();
  const apiUrl = (urlEl?.value || '').trim();

  if (!dsName) { toast('Masukkan nama dataset terlebih dahulu', 'error'); nameEl?.focus(); return; }
  if (!apiUrl)  { toast('URL API tidak boleh kosong', 'error'); urlEl?.focus(); return; }

  // UI loading
  btn.disabled = true;
  btn.textContent = '⏳ Mengambil data…';
  statusEl.style.display = 'block';
  statusEl.style.background = 'var(--pg)';
  statusEl.style.borderColor = 'rgba(107,52,175,.15)';
  statusEl.style.color = 'var(--pm)';
  statusEl.textContent = 'Menghubungi Google Sheets…';

  try {
    const res  = await fetch(apiUrl);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();

    // GAS read sheet mengembalikan: { status:'ok', data: [ {nama,kelas,...}, ... ] }
    let rows = [];
    if (data.status === 'ok' && Array.isArray(data.data)) {
      rows = data.data;
    } else if (Array.isArray(data)) {
      rows = data;
    } else {
      throw new Error('Format data tidak dikenali: ' + JSON.stringify(data).slice(0,80));
    }

    // Filter baris deleted (delete_flag === 'TRUE')
    rows = rows.filter(r => r.delete_flag !== 'TRUE' && r.delete_flag !== true);

    if (!rows.length) {
      throw new Error('Tidak ada data valid ditemukan di sheet');
    }

    // Buat dataset baru dengan kolom ANGGOTA_COLS
    const key = 'ds_' + Date.now();
    const importedRows = rows.map(r => {
      const newRow = { _status: 'pending', _selected: true };
      ANGGOTA_COLS.forEach(c => {
        newRow[c.key] = (r[c.key] !== undefined && r[c.key] !== null) ? String(r[c.key]) : '';
      });
      return newRow;
    });

    S.datasets[key] = {
      name: dsName,
      cols: deepCopy(ANGGOTA_COLS),
      rows: importedRows,
      tpl:  { subj: '', body: '', links: [] }
    };
    save();
    setDs(key);
    renderDs();
    closeM('mImportSheets');
    toast(`✓ ${importedRows.length} anggota berhasil diimpor`, 'success');

    // Reset form
    if (nameEl) nameEl.value = '';

  } catch (err) {
    statusEl.style.background = 'rgba(220,38,38,.08)';
    statusEl.style.borderColor = 'rgba(220,38,38,.2)';
    statusEl.style.color = 'var(--err)';
    statusEl.textContent = '✕ Gagal: ' + (err.message || 'Error tidak diketahui');
    btn.disabled = false;
    btn.textContent = '📥 Import Sekarang';
  }
}

function parseCSVLine(line) { const r=[];let cur='',inQ=false; for(const ch of line){if(ch==='"')inQ=!inQ;else if(ch===','&&!inQ){r.push(cur);cur='';}else cur+=ch;} r.push(cur); return r; }

// ── MOBILE PANEL SWITCHING ──────────────────────
function isMobile() { return window.innerWidth <= 768; }

function mobPanel(which) {
  if (!isMobile()) return;
  const map = {
    sidebar: { el: document.querySelector('.sidebar'),     btn: 'mnDataset'  },
    main:    { el: document.querySelector('.main-panel'),  btn: 'mnTabel'    },
    right:   { el: document.querySelector('.right-panel'), btn: 'mnTemplate' },
  };
  Object.entries(map).forEach(([key, { el, btn }]) => {
    const active = key === which;
    if (el) el.classList.toggle('mob-active', active);
    const b = document.getElementById(btn);
    if (b) b.classList.toggle('active', active);
  });
}

function initMobile() {
  if (isMobile()) {
    // Default tampilkan main panel
    mobPanel('main');
  } else {
    // Desktop: hapus mob-active agar CSS desktop yang berlaku
    ['sidebar','main-panel','right-panel'].forEach(cls => {
      const el = document.querySelector('.' + cls);
      if (el) el.classList.remove('mob-active');
    });
  }
}

window.addEventListener('resize', initMobile);
function tab(n) {
  document.querySelectorAll('.tab-btn').forEach((b,i)=>b.classList.toggle('active',['tpl','stats','cfg'][i]===n));
  document.querySelectorAll('.tab-pane').forEach(p=>p.classList.toggle('active',p.id==='tab-'+n));
}
function openM(id)  { document.getElementById(id).classList.add('open'); }
function closeM(id) { document.getElementById(id).classList.remove('open'); }
function toast(m,t='info') { const c=document.getElementById('toastC'),d=document.createElement('div'); d.className=`toast ${t}`; d.innerHTML=`<span>${{success:'✓',error:'✕',info:'ℹ'}[t]||'·'}</span><span>${m}</span>`; c.appendChild(d); setTimeout(()=>d.remove(),3500); }
