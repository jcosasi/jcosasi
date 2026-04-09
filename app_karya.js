/* ═══════════════════════════════════════════════
   Karya — app.js
   JCOSASI Gallery Web — VIEW ONLY
   Tipe: video, lagu, gambar, tulisan
   Backend: Google Apps Script (read only)
═══════════════════════════════════════════════ */

// ── CONFIG ─────────────────────────────────────
const GAS_URL = 'https://script.google.com/macros/s/AKfycby4syb7I0ygt_TuYPo3A3O-mQHNn8O0JLudGIWHzxS-AFa63EIZPaNL0QEOq5bkPo6AAQ/exec';
const SHEET   = 'karya';

// ── STATE ──────────────────────────────────────
let _allKarya   = [];
let _filtered   = [];
let _typeFilter = '';
let _tagFilter  = '';

// ── HELPERS ────────────────────────────────────
function esc(s) {
  return String(s || '')
    .replace(/&/g,'&amp;').replace(/"/g,'&quot;')
    .replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function gasRead() {
  const url = GAS_URL + '?' + new URLSearchParams({ action:'read', sheet: SHEET }).toString();
  const res  = await fetch(url);
  return res.json();
}

function toast(msg, type='info') {
  const c = document.getElementById('toastContainer');
  const d = document.createElement('div');
  d.className = `toast ${type}`;
  const ico = { success:'✓', error:'✕', info:'ℹ' }[type] || '·';
  d.innerHTML = `<span>${ico}</span><span>${msg}</span>`;
  c.appendChild(d);
  setTimeout(() => d.remove(), 3500);
}

function formatDate(str) {
  if (!str) return '';
  try {
    const d = new Date(str);
    if (isNaN(d)) return str;
    return d.toLocaleDateString('id-ID', { day:'2-digit', month:'short', year:'numeric' });
  } catch { return str; }
}

// ── TYPE META ──────────────────────────────────
const TYPE_META = {
  video:   { ico:'🎬', label:'Video',   badgeClass:'badge-video'   },
  artikel: { ico:'📄', label:'Artikel', badgeClass:'badge-tulisan' },
  audio:   { ico:'🎵', label:'Audio',   badgeClass:'badge-lagu'    },
  gambar:  { ico:'🖼️', label:'Gambar',  badgeClass:'badge-gambar'  },
  dokumen: { ico:'📁', label:'Dokumen', badgeClass:'badge-tulisan' },
  lainnya: { ico:'📎', label:'Lainnya', badgeClass:'badge-lainnya' },
  // alias lama agar data lama tetap tampil
  lagu:    { ico:'🎵', label:'Audio',   badgeClass:'badge-lagu'    },
  tulisan: { ico:'📄', label:'Artikel', badgeClass:'badge-tulisan' },
};
function typeMeta(t) { return TYPE_META[t] || { ico:'📎', label: t||'—', badgeClass:'badge-lainnya' }; }

// Normalisasi tipe — mapping alias lama → baru
function normalizeTipe(t) {
  const map = { lagu:'audio', tulisan:'artikel' };
  return map[t] || (t || '');
}

// ── INIT ───────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadKarya();
});

// ── LOAD DATA ──────────────────────────────────
async function loadKarya() {
  showLoading(true);
  try {
    const d = await gasRead();
    if (d.status !== 'ok') throw new Error(d.message || 'Gagal memuat data');
    _allKarya = (d.data || []).filter(k => k.delete_flag !== 'TRUE' && k.delete_flag !== true);
    buildTagCloud();
    filterKarya();
  } catch(e) {
    showLoading(false);
    document.getElementById('karyaGrid').innerHTML =
      `<div class="loading-state"><div style="color:var(--err)">⚠ ${esc(e.message)}</div></div>`;
  }
}

function showLoading(show) {
  const g = document.getElementById('karyaGrid');
  const e = document.getElementById('emptyState');
  if (show) {
    g.innerHTML = `<div class="loading-state">
      <div class="loading-ring"></div>
      <div class="loading-txt">Memuat karya…</div>
    </div>`;
    e.style.display = 'none';
  }
}

// ── TAG CLOUD ──────────────────────────────────
function buildTagCloud() {
  const tagCount = {};
  _allKarya.forEach(k => {
    (k.tag || '').split(';').map(t => t.trim()).filter(Boolean).forEach(t => {
      tagCount[t] = (tagCount[t] || 0) + 1;
    });
  });
  const sorted = Object.entries(tagCount).sort((a,b) => b[1]-a[1]).slice(0, 20);
  const wrap = document.getElementById('tagChips');
  wrap.innerHTML = sorted.map(([tag]) =>
    `<button class="tag-chip ${tag===_tagFilter?'active':''}" onclick="setTagFilter('${esc(tag)}')">${esc(tag)}</button>`
  ).join('');
}

// ── FILTER & SORT ──────────────────────────────
function setTypeFilter(btn, type) {
  _typeFilter = type;
  document.querySelectorAll('.ftype-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  filterKarya();
}

function setTagFilter(tag) {
  _tagFilter = _tagFilter === tag ? '' : tag;
  document.querySelectorAll('.tag-chip').forEach(b => {
    b.classList.toggle('active', b.textContent === _tagFilter);
  });
  filterKarya();
}

function filterKarya() {
  const q    = (document.getElementById('searchInp').value || '').toLowerCase().trim();
  const sort = document.getElementById('sortSel').value;

  let list = _allKarya.filter(k => {
    if (_typeFilter && normalizeTipe(k.tipe) !== _typeFilter) return false;
    if (_tagFilter) {
      const tags = (k.tag || '').split(';').map(t => t.trim());
      if (!tags.includes(_tagFilter)) return false;
    }
    if (q) {
      const haystack = [k.judul, k.pembuat, k.deskripsi, k.tag].join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });

  if (sort === 'terbaru') list.sort((a,b) => (b.tanggal||'').localeCompare(a.tanggal||''));
  if (sort === 'terlama') list.sort((a,b) => (a.tanggal||'').localeCompare(b.tanggal||''));
  if (sort === 'judul')   list.sort((a,b) => (a.judul||'').localeCompare(b.judul||'', 'id'));

  _filtered = list;
  renderGrid();
}

// ── RENDER GRID ────────────────────────────────
function renderGrid() {
  const grid  = document.getElementById('karyaGrid');
  const empty = document.getElementById('emptyState');
  document.getElementById('galleryCount').textContent = `${_filtered.length} karya`;

  if (!_filtered.length) {
    grid.innerHTML = '';
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  grid.innerHTML = _filtered.map((k, i) => renderCard(k, i)).join('');
}

function renderCard(k, i) {
  const tm     = typeMeta(k.tipe);
  const imgUrl = k.thumbnail_url || k.cover_url || '';
  const tags   = (k.tag||'').split(';').map(t=>t.trim()).filter(Boolean);
  const delay  = Math.min(i * 40, 400);

  const thumbHtml = imgUrl
    ? `<img src="${esc(imgUrl)}" alt="${esc(k.judul)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
    : '';
  const placeholderDisplay = imgUrl ? 'none' : 'flex';

  const isVideo = normalizeTipe(k.tipe) === 'video';

  return `<div class="karya-card" onclick="openLightbox('${esc(k.id)}')" style="animation-delay:${delay}ms">
    <div class="card-thumb">
      ${thumbHtml}
      <div class="card-thumb-placeholder" style="display:${placeholderDisplay}">
        <div class="ctp-ico">${tm.ico}</div>
        <div class="ctp-type">${tm.label}</div>
      </div>
      <span class="card-type-badge ${tm.badgeClass}">${tm.label}</span>
      ${isVideo ? `<div class="card-play-overlay"><div class="play-circle">▶</div></div>` : ''}
    </div>
    <div class="card-body">
      <div class="card-judul">${esc(k.judul||'Tanpa Judul')}</div>
      ${k.pembuat ? `<div class="card-pembuat">${esc(k.pembuat)}</div>` : ''}
      ${k.deskripsi ? `<div class="card-desc">${esc(k.deskripsi)}</div>` : ''}
      ${tags.length ? `<div class="card-tags">${tags.slice(0,4).map(t=>`<span class="card-tag">${esc(t)}</span>`).join('')}</div>` : ''}
    </div>
    <div class="card-footer">
      <span class="card-date">${formatDate(k.tanggal)}</span>
      ${k.proker_id ? `<span class="card-proker">📋 ${esc(k.proker_id)}</span>` : ''}
    </div>
  </div>`;
}

// ── LIGHTBOX ───────────────────────────────────
function openLightbox(id) {
  const k = _allKarya.find(x => x.id === id);
  if (!k) return;

  const lb    = document.getElementById('lightbox');
  const inner = document.getElementById('lbInner');
  const tm    = typeMeta(k.tipe);
  const tipe  = normalizeTipe(k.tipe);
  const tags  = (k.tag||'').split(';').map(t=>t.trim()).filter(Boolean);

  let mediaHtml = '';
  const mediaUrl = k.media_url || '';

  // Tentukan kelompok render berdasarkan tipe ternormalisasi
  const isDoc   = tipe === 'artikel' || tipe === 'dokumen';
  const isAudio = tipe === 'audio';

  if (tipe === 'video') {
    const ytId = extractYoutubeId(mediaUrl);
    if (ytId) {
      const thumb = k.thumbnail_url
        || `https://img.youtube.com/vi/${ytId}/maxresdefault.jpg`;
      mediaHtml = `<div class="lb-yt-preview" id="lbYtPreview">
        <img class="lb-yt-thumb" src="${esc(thumb)}"
          onerror="this.src='https://img.youtube.com/vi/${ytId}/hqdefault.jpg'"
          alt="${esc(k.judul)}">
        <div class="lb-yt-overlay">
          <button class="lb-yt-play-here" onclick="tryEmbedYt('${ytId}')" title="Coba putar di sini">
            <span class="lb-yt-play-ico">▶</span>
            <span>Putar di Sini</span>
          </button>
          <a class="lb-yt-open" href="https://youtu.be/${ytId}" target="_blank" rel="noopener">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M21.58 7.19c-.23-.86-.91-1.54-1.77-1.77C18.25 5 12 5 12 5s-6.25 0-7.81.42c-.86.23-1.54.91-1.77 1.77C2 8.75 2 12 2 12s0 3.25.42 4.81c.23.86.91 1.54 1.77 1.77C5.75 19 12 19 12 19s6.25 0 7.81-.42c.86-.23 1.54-.91 1.77-1.77C22 15.25 22 12 22 12s0-3.25-.42-4.81zM10 15V9l5.2 3-5.2 3z"/></svg>
            Tonton di YouTube
          </a>
        </div>
      </div>
      <div class="lb-media" id="lbYtEmbed" style="display:none"></div>`;
    } else if (mediaUrl) {
      const driveId = extractDriveId(mediaUrl);
      const src = driveId
        ? `https://drive.google.com/file/d/${driveId}/preview`
        : mediaUrl;
      mediaHtml = `<div class="lb-media"><iframe src="${esc(src)}" allowfullscreen></iframe></div>`;
    }

  } else if (isAudio) {
    const coverImg = k.cover_url || k.thumbnail_url || '';
    const driveId  = extractDriveId(mediaUrl);
    const src = driveId ? `https://drive.google.com/uc?export=download&id=${driveId}` : mediaUrl;
    mediaHtml = `<div class="lb-audio-wrap">
      ${coverImg
        ? `<img class="lb-audio-cover" src="${esc(coverImg)}" alt="cover">`
        : `<div class="lb-audio-cover-ph">🎵</div>`}
      ${src ? `<audio controls autoplay src="${esc(src)}"></audio>` : '<div style="color:rgba(255,255,255,.4);font-size:.8rem">Tidak ada file audio</div>'}
    </div>`;

  } else if (tipe === 'gambar') {
    const imgSrc = k.media_url || k.cover_url || k.thumbnail_url || '';
    const driveId = extractDriveId(imgSrc);
    const src = driveId ? `https://drive.google.com/thumbnail?id=${driveId}&sz=w1600` : imgSrc;
    mediaHtml = src ? `
      <div class="lb-zoom-wrap" id="lbZoomWrap">
        <div class="lb-zoom-stage" id="lbZoomStage">
          <img class="lb-zoom-img" id="lbZoomImg" src="${esc(src)}" alt="${esc(k.judul)}" draggable="false">
        </div>
        <div class="lb-zoom-controls">
          <button class="lb-zc-btn" onclick="zoomImg(-0.25)" title="Zoom out">－</button>
          <span class="lb-zc-level" id="lbZoomLevel">100%</span>
          <button class="lb-zc-btn" onclick="zoomImg(0.25)" title="Zoom in">＋</button>
          <button class="lb-zc-btn" onclick="zoomReset()" title="Reset">⤢</button>
        </div>
      </div>` : '';

  } else if (isDoc) {
    const embedSrc = buildDocEmbedUrl(mediaUrl);
    if (embedSrc) {
      mediaHtml = `<div class="lb-doc-frame">
        <div class="lb-doc-header">
          <div class="lb-doc-title">${esc(k.judul||'Tanpa Judul')}</div>
          <div class="lb-doc-header-right">
            ${k.pembuat ? `<span class="lb-doc-by">✎ ${esc(k.pembuat)}</span>` : ''}
            <a class="lb-open-btn" href="${esc(mediaUrl)}" target="_blank" rel="noopener">↗ Buka</a>
          </div>
        </div>
        <iframe
          id="lbDocIframe"
          src="${esc(embedSrc)}"
          class="lb-doc-iframe"
          frameborder="0"
          allowfullscreen
        ></iframe>
      </div>`;
    } else {
      mediaHtml = `<div class="lb-doc-frame lb-doc-nourl">
        <div class="lb-vf-ico">${tm.ico}</div>
        <div class="lb-vf-msg">URL dokumen tidak tersedia</div>
      </div>`;
    }

  } else {
    // lainnya — tampilkan link saja
    mediaHtml = mediaUrl ? `<div class="lb-lainnya-wrap">
      <div class="lb-lainnya-ico">📎</div>
      <div class="lb-lainnya-msg">Buka file di tab baru untuk melihat konten</div>
      <a class="lb-vf-btn" href="${esc(mediaUrl)}" target="_blank" rel="noopener">↗ Buka File</a>
    </div>` : '';
  }

  inner.innerHTML = `
    <button class="lb-close-inner" onclick="closeLightbox()">✕</button>
    ${mediaHtml}
    ${!isDoc ? `<div class="lb-info">
      <div class="lb-info-top">
        <div class="lb-judul">${esc(k.judul||'Tanpa Judul')}</div>
        <span class="lb-type-badge ${tm.badgeClass}">${tm.label}</span>
      </div>
      ${k.pembuat ? `<div class="lb-pembuat">${tm.ico} ${esc(k.pembuat)}</div>` : ''}
      ${k.deskripsi ? `<div class="lb-desc">${esc(k.deskripsi)}</div>` : ''}
      ${tags.length ? `<div class="lb-tags">${tags.map(t=>`<span class="card-tag">${esc(t)}</span>`).join('')}</div>` : ''}
      <div class="lb-meta">
        ${k.tanggal ? `<span>📅 ${formatDate(k.tanggal)}</span>` : ''}
        ${k.proker_id ? `<span>📋 Proker ${esc(k.proker_id)}</span>` : ''}
        ${mediaUrl ? `<a class="lb-open-btn" href="${esc(mediaUrl)}" target="_blank" rel="noopener">↗ Buka Asli</a>` : ''}
      </div>
    </div>` : ''}`;

  inner.classList.toggle('lb-tulisan', isDoc);

  lb.classList.add('open');
  document.body.style.overflow = 'hidden';

  if (tipe === 'gambar') requestAnimationFrame(_initImageZoom);
  if (isDoc) _docZoom = 1;
}

function closeLightbox(e) {
  if (e && e.target !== document.getElementById('lightbox') && !e.target.classList.contains('lb-close')) return;
  const lb = document.getElementById('lightbox');
  lb.classList.remove('open');
  document.body.style.overflow = '';
  lb.querySelectorAll('audio,video,iframe').forEach(el => {
    try { el.src = ''; } catch(_) {}
  });
  document.getElementById('lbInner').innerHTML = '';
  document.getElementById('lbInner').classList.remove('lb-tulisan');
}

// ── DOCUMENT EMBED URL BUILDER ─────────────────
// Mengubah berbagai format URL Google Drive/Docs ke URL embed yang bisa di-iframe
function buildDocEmbedUrl(url) {
  if (!url) return null;

  // ── Format 1: Google Docs/Sheets/Slides edit URL ──
  // https://docs.google.com/document/d/FILE_ID/edit?...
  // https://docs.google.com/spreadsheets/d/FILE_ID/edit?...
  // https://docs.google.com/presentation/d/FILE_ID/edit?...
  const docsMatch = url.match(
    /docs\.google\.com\/(document|spreadsheets|presentation|forms)\/d\/([a-zA-Z0-9_-]+)/
  );
  if (docsMatch) {
    const type = docsMatch[1];
    const id   = docsMatch[2];
    const embedPath = {
      document:     'document',
      spreadsheets: 'spreadsheets',
      presentation: 'presentation',
      forms:        'forms',
    }[type] || 'document';
    return `https://docs.google.com/${embedPath}/d/${id}/preview`;
  }

  // ── Format 2: Google Drive file URL ──
  // https://drive.google.com/file/d/FILE_ID/view?...
  const driveFileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (driveFileMatch) {
    return `https://drive.google.com/file/d/${driveFileMatch[1]}/preview`;
  }

  // ── Format 3: drive.google.com/open?id=FILE_ID ──
  const openMatch = url.match(/drive\.google\.com\/open\?.*id=([a-zA-Z0-9_-]+)/);
  if (openMatch) {
    // Gunakan Google Docs Viewer untuk file umum (pdf, docx, dll)
    return `https://docs.google.com/viewer?url=https://drive.google.com/uc?id=${openMatch[1]}&embedded=true`;
  }

  // ── Format 4: URL langsung ke file (pdf, docx, txt) ──
  // Gunakan Google Docs Viewer sebagai viewer universal
  if (url.match(/\.(pdf|doc|docx|ppt|pptx|xls|xlsx|txt)(\?|$)/i)) {
    return `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
  }

  // ── Fallback: coba Google Docs Viewer ──
  if (url.startsWith('http')) {
    return `https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`;
  }

  return null;
}

// ── URL HELPERS ────────────────────────────────
function extractYoutubeId(url) {
  if (!url) return null;
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})(?:[?&]|$)/
  ) || url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

// Coba embed YouTube — jika Error 153, otomatis tampilkan fallback
function tryEmbedYt(ytId) {
  const preview = document.getElementById('lbYtPreview');
  const embed   = document.getElementById('lbYtEmbed');
  if (!embed) return;

  // Tampilkan iframe
  embed.style.display = 'block';
  embed.innerHTML = `<iframe
    id="lbYtFrame"
    src="https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0&playsinline=1"
    allow="autoplay; encrypted-media; picture-in-picture"
    allowfullscreen>
  </iframe>`;
  if (preview) preview.style.display = 'none';

  // Deteksi error via postMessage dari YouTube player
  const handler = (e) => {
    try {
      const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      if (data && data.event === 'infoDelivery' && data.info?.error) {
        showYtFallback(ytId);
        window.removeEventListener('message', handler);
      }
    } catch(_) {}
  };
  window.addEventListener('message', handler);

  // Fallback timer 5 detik — jika iframe masih menampilkan error page YouTube
  setTimeout(() => {
    window.removeEventListener('message', handler);
    const frame = document.getElementById('lbYtFrame');
    if (!frame) return;
    try {
      // Jika bisa akses contentDocument = masih di domain kita = error/blank
      const doc = frame.contentDocument;
      if (doc) showYtFallback(ytId);
    } catch(_) {
      // Cross-origin exception = frame berhasil load YouTube = OK
    }
  }, 5000);
}

function showYtFallback(ytId) {
  const embed   = document.getElementById('lbYtEmbed');
  const preview = document.getElementById('lbYtPreview');
  if (embed) {
    embed.innerHTML = `<div class="lb-video-fallback">
      <div class="lb-vf-ico">▶</div>
      <div class="lb-vf-msg">Video tidak bisa diputar di sini</div>
      <div class="lb-vf-sub">Embedding dinonaktifkan oleh pemilik video (Error 153)</div>
      <a class="lb-vf-btn" href="https://youtu.be/${ytId}" target="_blank" rel="noopener">
        Tonton di YouTube ↗
      </a>
    </div>`;
  }
  if (preview) preview.style.display = 'none';
}
function extractDriveId(url) {
  if (!url) return null;
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? m[1] : null;
}

// ── KEYBOARD ───────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    closeLightbox({ target: document.getElementById('lightbox') });
  }
});

// ══ ZOOM SYSTEM ════════════════════════════════

// ── Image Zoom ─────────────────────────────────
let _zoom       = 1;
let _zoomMin    = 0.25;
let _zoomMax    = 5;
let _panX       = 0;
let _panY       = 0;
let _dragging   = false;
let _dragStartX = 0;
let _dragStartY = 0;
let _dragOriginX= 0;
let _dragOriginY= 0;

// Pinch-to-zoom state
let _lastPinchDist = null;

function _applyZoom() {
  const img = document.getElementById('lbZoomImg');
  if (!img) return;
  _zoom = Math.min(_zoomMax, Math.max(_zoomMin, _zoom));
  img.style.transform = `translate(${_panX}px, ${_panY}px) scale(${_zoom})`;
  img.style.cursor = _zoom > 1 ? 'grab' : 'default';
  const el = document.getElementById('lbZoomLevel');
  if (el) el.textContent = Math.round(_zoom * 100) + '%';
}

function zoomImg(delta) {
  _zoom += delta;
  if (_zoom <= 1) { _panX = 0; _panY = 0; }
  _applyZoom();
}

function zoomReset() {
  _zoom = 1; _panX = 0; _panY = 0;
  _applyZoom();
}

function _initImageZoom() {
  const wrap = document.getElementById('lbZoomWrap');
  const img  = document.getElementById('lbZoomImg');
  if (!wrap || !img) return;

  _zoom = 1; _panX = 0; _panY = 0;

  // ── Mouse wheel zoom ──
  wrap.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.15 : -0.15;
    _zoom += delta;
    if (_zoom <= 1) { _panX = 0; _panY = 0; }
    _applyZoom();
  }, { passive: false });

  // ── Mouse drag ──
  img.addEventListener('mousedown', e => {
    if (_zoom <= 1) return;
    e.preventDefault();
    _dragging   = true;
    _dragStartX = e.clientX;
    _dragStartY = e.clientY;
    _dragOriginX= _panX;
    _dragOriginY= _panY;
    img.style.cursor = 'grabbing';
  });
  document.addEventListener('mousemove', e => {
    if (!_dragging) return;
    _panX = _dragOriginX + (e.clientX - _dragStartX);
    _panY = _dragOriginY + (e.clientY - _dragStartY);
    _applyZoom();
  });
  document.addEventListener('mouseup', () => {
    if (!_dragging) return;
    _dragging = false;
    const img2 = document.getElementById('lbZoomImg');
    if (img2) img2.style.cursor = _zoom > 1 ? 'grab' : 'default';
  });

  // ── Double click to zoom in/reset ──
  img.addEventListener('dblclick', e => {
    if (_zoom > 1) { zoomReset(); return; }
    _zoom = 2.5;
    // Center zoom pada posisi klik
    const rect = wrap.getBoundingClientRect();
    _panX = (rect.width  / 2 - (e.clientX - rect.left)) * (_zoom - 1) / _zoom;
    _panY = (rect.height / 2 - (e.clientY - rect.top))  * (_zoom - 1) / _zoom;
    _applyZoom();
  });

  // ── Touch: pinch-to-zoom + drag ──
  let _touchPanX = 0, _touchPanY = 0;
  let _touchOriginX = 0, _touchOriginY = 0;
  let _touchStartX = 0, _touchStartY = 0;

  wrap.addEventListener('touchstart', e => {
    if (e.touches.length === 2) {
      _lastPinchDist = _pinchDist(e.touches);
    } else if (e.touches.length === 1 && _zoom > 1) {
      _touchStartX  = e.touches[0].clientX;
      _touchStartY  = e.touches[0].clientY;
      _touchOriginX = _panX;
      _touchOriginY = _panY;
    }
  }, { passive: true });

  wrap.addEventListener('touchmove', e => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist  = _pinchDist(e.touches);
      const ratio = dist / (_lastPinchDist || dist);
      _lastPinchDist = dist;
      _zoom *= ratio;
      if (_zoom <= 1) { _panX = 0; _panY = 0; }
      _applyZoom();
    } else if (e.touches.length === 1 && _zoom > 1) {
      e.preventDefault();
      _panX = _touchOriginX + (e.touches[0].clientX - _touchStartX);
      _panY = _touchOriginY + (e.touches[0].clientY - _touchStartY);
      _applyZoom();
    }
  }, { passive: false });

  wrap.addEventListener('touchend', () => {
    _lastPinchDist = null;
    if (_zoom <= 1) { _panX = 0; _panY = 0; _applyZoom(); }
  });

  // ── Double tap to zoom ──
  let _lastTap = 0;
  wrap.addEventListener('touchend', e => {
    const now = Date.now();
    if (now - _lastTap < 300) {
      if (_zoom > 1) { zoomReset(); }
      else { _zoom = 2.5; _applyZoom(); }
    }
    _lastTap = now;
  });
}

function _pinchDist(touches) {
  const dx = touches[0].clientX - touches[1].clientX;
  const dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx*dx + dy*dy);
}

// ── Doc Zoom (iframe scale via CSS) ────────────
let _docZoom = 1;

function zoomDoc(delta) {
  const wrap = document.getElementById('lbDocIframeWrap');
  const iframe = document.getElementById('lbDocIframe');
  const lvl = document.getElementById('lbDocZoomLevel');
  if (!wrap || !iframe) return;

  _docZoom = Math.min(2.5, Math.max(0.5, _docZoom + delta));

  // Scale iframe — perlu set width ke 100%/zoom agar tidak terpotong
  iframe.style.transform       = `scale(${_docZoom})`;
  iframe.style.transformOrigin = 'top left';
  iframe.style.width           = (100 / _docZoom) + '%';
  iframe.style.height          = (100 / _docZoom) + '%';

  if (lvl) lvl.textContent = Math.round(_docZoom * 100) + '%';
}

function zoomDocReset() {
  const wrap   = document.getElementById('lbDocIframeWrap');
  const iframe = document.getElementById('lbDocIframe');
  const lvl    = document.getElementById('lbDocZoomLevel');
  if (!iframe) return;
  _docZoom = 1;
  iframe.style.transform = '';
  iframe.style.width     = '100%';
  iframe.style.height    = '100%';
  if (lvl) lvl.textContent = '100%';
}
