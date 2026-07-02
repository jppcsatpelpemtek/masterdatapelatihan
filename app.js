// app.js - Master Data Pelatihan Application Script

// Document key human-readable labels mapping — URUTAN SESUAI KOLOM SPREADSHEET
let DOCUMENT_LABELS = {
  kurikulum: "Kurikulum",
  kak: "KAK",
  undangan_rapat_persiapan: "Undangan Rapat Persiapan",
  notulen_rapat_persiapan: "Notulen Rapat Persiapan",
  permohonan_narsum: "Permohonan Narsum",
  surat_permohonan_peserta: "Surat Permohonan Peserta",
  panggilan_peserta: "Panggilan Peserta",
  sk_penunjukan: "SK Penunjukan",
  st_penyelenggara: "ST Penyelenggara",
  st_wi: "ST WI",
  undangan_rapat_evaluasi: "Undangan Rapat Evaluasi",
  notulen_rapat_evaluasi: "Notulen Rapat Evaluasi",
  berita_acara_evaluasi: "Berita Acara Evaluasi",
  sk_penetapan: "SK Penetapan",
  surat_pengembalian_peserta: "Surat Pengembalian Peserta",
  rekap_nilai: "Rekap Nilai Peserta",
  absensi: "Absensi Peserta",
  biodata_pengajar: "Biodata Pengajar",
  daftar_hadir_narsum: "Daftar Hadir Narasumber",
  daftar_hadir_penyelenggara: "Daftar Hadir Penyelenggara",
  ktp_npwp: "KTP, NPWP Pengajar",
  materi: "Materi Pengajar",
  jadwal: "Jadwal Harian",
  laporan_akhir: "Laporan Akhir",
  dokumentasi: "Dokumentasi",
  hasil_evaluasi: "Hasil Evaluasi"
};

// Google Apps Script Web App Deployment URL (Dipertahankan hanya untuk pencarian file)
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxlbk-u_EVR7CuZ9PjBkAPTMP7RmZZa7n0xhTscl2pKDz9CPfKropNQ-GTTrImRkYlJ/exec';

// --- Firebase Configuration ---
const firebaseConfig = {
  apiKey: "AIzaSyDhXu7mqcjsxmIkLTRTEKRTmEcqm2UujEQ",
  authDomain: "pemerintahanteknis.firebaseapp.com",
  projectId: "pemerintahanteknis",
  storageBucket: "pemerintahanteknis.firebasestorage.app",
  messagingSenderId: "221447418890",
  appId: "1:221447418890:web:cc5e4c6b1119121ee31bf3",
  measurementId: "G-36E9QX94S0"
};

// Initialize Firebase
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();

// Global State
let state = {
  kegiatanList: [],
  isAdmin: false,
  selectedKegiatanId: null,
  selectedAngkatanIndex: 0,
  filters: {
    search: '',
    triwulan: 'all',
    tahun: 'all',
    dokumen: 'all'
  }
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
  initData();
  checkAdminSession();
  setupEventListeners();
});

// Loading overlay helper
function showLoading(show, text = "Menghubungkan ke Google Sheets...") {
  const overlay = document.getElementById('modal-loading');
  const loadingText = document.getElementById('loading-text');
  if (overlay) {
    if (show) {
      if (loadingText) loadingText.innerText = text;
      overlay.classList.add('active');
    } else {
      overlay.classList.remove('active');
    }
  }
}

// JSONP helper - satu-satunya cara yang valid untuk GET data dari Apps Script tanpa CORS error
function fetchWithJSONP(url) {
  return new Promise((resolve, reject) => {
    const callbackName = 'gscb_' + Date.now();
    const script = document.createElement('script');
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('JSONP timeout'));
    }, 15000);

    function cleanup() {
      clearTimeout(timeout);
      delete window[callbackName];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[callbackName] = function (data) {
      cleanup();
      resolve(data);
    };

    script.src = url + (url.includes('?') ? '&' : '?') + 'callback=' + callbackName;
    script.onerror = function () {
      cleanup();
      reject(new Error('JSONP script load error'));
    };
    document.head.appendChild(script);
  });
}

// Tampilkan status sinkronisasi di header
function setSyncStatus(status, message) {
  const badge = document.getElementById('sync-status');
  const label = document.getElementById('sync-time-label');
  const btn = document.getElementById('btn-sync');

  if (status === 'syncing') {
    badge.style.display = 'none';
    if (btn) btn.classList.add('syncing');
  } else if (status === 'success') {
    badge.style.display = 'flex';
    if (label) label.innerText = message || 'Tersinkronisasi';
    if (btn) btn.classList.remove('syncing');
  } else if (status === 'error') {
    badge.style.display = 'flex';
    badge.querySelector('i').style.color = '#ef4444';
    if (label) label.innerText = message || 'Gagal terhubung ke Sheets';
    if (btn) btn.classList.remove('syncing');
  }
}
// Fetch data dari Firebase Firestore
async function syncFromFirebase() {
  setSyncStatus('syncing');
  showLoading(true, 'Menyinkan dengan Firebase...');
  
  try {
    const snapshot = await db.collection('master_data').doc('pelatihan_db').get();
    
    if (snapshot.exists) {
      const data = snapshot.data().kegiatanList;
      const docLabels = snapshot.data().documentLabels;
      
      if (docLabels && typeof docLabels === 'object') {
        DOCUMENT_LABELS = docLabels;
        localStorage.setItem('document_labels', JSON.stringify(docLabels));
      }
      
      if (Array.isArray(data)) {
        state.kegiatanList = data;
        localStorage.setItem('pelatihan_db', JSON.stringify(data));
        renderApp();
        const now = new Date();
        const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        setSyncStatus('success', `Disinkronkan pukul ${timeStr} (Firebase)`);
      } else {
        throw new Error("Format data di Firebase tidak sesuai");
      }
    } else {
      console.warn("Dokumen tidak ditemukan di Firebase, menggunakan data lokal.");
      setSyncStatus('error', 'Data tidak ada di Firebase');
    }
  } catch (err) {
    console.error("Gagal menarik data dari Firebase:", err);
    setSyncStatus('error', 'Gagal terhubung Firebase');
    alert('Gagal mengambil data dari Firebase.\nDetail error: ' + err.message);
  } finally {
    showLoading(false);
  }
}

// Fungsi Migrasi (Sementara) - Memindahkan data lokal (bekas Sheets) ke Firebase
window.migrateToFirebase = async function() {
  if (!confirm("PENTING: Apakah Anda yakin ingin memigrasikan data yang tampil saat ini ke Firebase? Ini akan menimpa database Firebase Anda.")) return;
  
  showLoading(true, 'Memigrasikan data ke Firebase Firestore...');
  try {
    await db.collection('master_data').doc('pelatihan_db').set({
      kegiatanList: state.kegiatanList,
      documentLabels: DOCUMENT_LABELS,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    alert("Migrasi ke Firebase berhasil! Website sekarang menggunakan Firestore.");
  } catch (err) {
    console.error("Migrasi gagal:", err);
    alert("Migrasi gagal: " + err.message);
  } finally {
    showLoading(false);
  }
}

// Load data saat pertama kali — langsung dari Sheets, localStorage sebagai fallback
async function initData() {
  // Load document labels from localStorage first if available
  const localLabels = localStorage.getItem('document_labels');
  if (localLabels) {
    try {
      DOCUMENT_LABELS = JSON.parse(localLabels);
    } catch (e) {}
  }

  if (APPS_SCRIPT_URL) {
    const localDb = localStorage.getItem('pelatihan_db');
    if (localDb) {
      try {
        state.kegiatanList = JSON.parse(localDb);
        renderApp();
      } catch (e) { /* abaikan error parsing cache */ }
    }
    await syncFromFirebase();

  } else {
    const localDb = localStorage.getItem('pelatihan_db');
    if (localDb) {
      try {
        state.kegiatanList = JSON.parse(localDb);
      } catch (e) {
        state.kegiatanList = INITIAL_DATA;
      }
    } else {
      state.kegiatanList = INITIAL_DATA;
      localStorage.setItem('pelatihan_db', JSON.stringify(INITIAL_DATA));
    }
    renderApp();
  }
}

async function saveToLocalStorage() {
  // Simpan ke localStorage sebagai cache lokal
  localStorage.setItem('pelatihan_db', JSON.stringify(state.kegiatanList));
  localStorage.setItem('document_labels', JSON.stringify(DOCUMENT_LABELS));

  setSyncStatus('syncing');
  showLoading(true, 'Menyimpan perubahan ke Firebase...');
  try {
    await db.collection('master_data').doc('pelatihan_db').set({
      kegiatanList: state.kegiatanList,
      documentLabels: DOCUMENT_LABELS,
      lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
    });
    const now = new Date();
    const timeStr = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    setSyncStatus('success', `Disimpan pukul ${timeStr} (Firebase)`);
  } catch (err) {
    console.error('Gagal menyimpan ke Firebase:', err);
    setSyncStatus('error', 'Gagal menyimpan');
    alert('Gagal menyimpan ke Firebase: ' + err.message);
  } finally {
    showLoading(false);
  }
}

function checkAdminSession() {
  const adminSession = sessionStorage.getItem('admin_session');
  if (adminSession === 'active') {
    state.isAdmin = true;
    updateAdminUI(true);
  }
}


// --- Render Operations ---
function renderApp() {
  renderStatistics();
  populateTahunDropdown();
  renderTable();
}

// Populate Tahun dropdown secara dinamis dari data
function populateTahunDropdown() {
  const select = document.getElementById('filter-tahun');
  if (!select) return;

  const currentVal = select.value;
  const years = new Set();

  state.kegiatanList.forEach(keg => {
    keg.angkatan.forEach(ang => {
      if (ang.tahun) years.add(ang.tahun.toString());
    });
  });

  const sortedYears = [...years].sort((a, b) => b - a);

  select.innerHTML = '<option value="all">Semua Tahun</option>';
  sortedYears.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    select.appendChild(opt);
  });

  // Restore previous selection if still valid
  if ([...select.options].some(o => o.value === currentVal)) {
    select.value = currentVal;
  }
}

// Calculations for Statistics Cards
function renderStatistics() {
  const filteredList = getFilteredData();
  
  let totalKegiatan = filteredList.length;
  let totalAngkatan = 0;
  let totalPeserta = 0;
  let totalLulus = 0;

  let totalDocSlots = 0;
  let availableDocs = 0;

  filteredList.forEach(keg => {
    // Saring angkatan di dalam kegiatan sesuai filter Tahun dan Triwulan aktif
    const activeAngkatans = keg.angkatan.filter(ang => {
      // Filter Tahun
      let matchesTahun = true;
      if (state.filters.tahun !== 'all') {
        matchesTahun = ang.tahun && ang.tahun.toString() === state.filters.tahun;
      }
      // Filter Triwulan
      let matchesTriwulan = true;
      if (state.filters.triwulan !== 'all') {
        matchesTriwulan = ang.triwulan.includes(state.filters.triwulan);
      }
      return matchesTahun && matchesTriwulan;
    });

    totalAngkatan += activeAngkatans.length;
    
    activeAngkatans.forEach(ang => {
      // Total Peserta
      const pCount = parseInt(ang.total_peserta) || 0;
      totalPeserta += pCount;

      // Total Lulus — hanya hitung jika nilainya angka valid (bukan '-' atau kosong)
      const lulusRaw = ang.lulus;
      const lulusNum = (lulusRaw !== null && lulusRaw !== undefined && lulusRaw !== '' && lulusRaw !== '-') ? parseInt(lulusRaw) : NaN;
      if (!isNaN(lulusNum)) {
        totalLulus += lulusNum;
      }

      // Documents completeness check
      Object.keys(DOCUMENT_LABELS).forEach(docKey => {
        totalDocSlots++;
        if (ang.documents && ang.documents[docKey]) {
          availableDocs++;
        }
      });
    });
  });

  const graduationRate = totalPeserta > 0 ? Math.round((totalLulus / totalPeserta) * 100) : 0;
  const docCompletenessRate = totalDocSlots > 0 ? Math.round((availableDocs / totalDocSlots) * 100) : 0;

  document.getElementById('stat-total-kegiatan').innerText = totalKegiatan;
  document.getElementById('stat-total-angkatan').innerText = totalAngkatan;
  document.getElementById('stat-total-peserta').innerText = totalPeserta.toLocaleString('id-ID');
  document.getElementById('stat-kelulusan-rate').innerText = `${graduationRate}%`;
  document.getElementById('stat-dokumen-rate').innerText = `${docCompletenessRate}%`;
}

// Render Main Table
function renderTable() {
  const tbody = document.getElementById('kegiatan-tbody');
  tbody.innerHTML = '';

  const filteredList = getFilteredData();

  document.getElementById('data-count-badge').innerText = `Menampilkan ${filteredList.length} data`;

  if (filteredList.length === 0) {
    document.getElementById('no-data-alert').classList.remove('hidden');
    document.getElementById('main-data-table').classList.add('hidden');
    return;
  }

  document.getElementById('no-data-alert').classList.add('hidden');
  document.getElementById('main-data-table').classList.remove('hidden');

  filteredList.forEach((keg, idx) => {
    // Calculate stats per kegiatan
    const totalAngk = keg.angkatan.length;

    // Get unique Triwulan list
    const triwulans = [...new Set(keg.angkatan.map(a => {
      const tw = a.triwulan || '';
      return tw ? `TW ${tw}` : '';
    }).filter(t => t))].join(', ');

    // Get unique Tahun list
    const years = [...new Set(keg.angkatan.map(a => a.tahun).filter(y => y))].join(', ');

    // Calculate average kelulusan rate — sinkronkan dengan data peserta lulus yang valid
    let totalPesertaKeg = 0;
    let totalLulusKeg = 0;
    keg.angkatan.forEach(a => {
      totalPesertaKeg += parseInt(a.total_peserta) || 0;
      const lulusVal = a.lulus;
      const lulusNum = (lulusVal !== null && lulusVal !== undefined && lulusVal !== '' && lulusVal !== '-') ? parseInt(lulusVal) : NaN;
      if (!isNaN(lulusNum)) {
        totalLulusKeg += lulusNum;
      }
    });
    const avgLulus = totalPesertaKeg > 0 ? Math.round((totalLulusKeg / totalPesertaKeg) * 100) : 0;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${keg.no || (idx + 1)}</td>
      <td><strong>${escapeHtml(keg.kegiatan)}</strong></td>
      <td class="text-center"><span class="count-badge">${totalAngk} Angkatan</span></td>
      <td><i class="fa-solid fa-calendar-days text-muted"></i> ${triwulans || '-'}</td>
      <td>${years || '-'}</td>
      <td>
        <div style="display:flex; align-items:center; gap:0.5rem;">
          <strong style="color: ${avgLulus >= 90 ? 'var(--color-success)' : 'var(--color-warning)'}">${avgLulus}%</strong>
          <span style="font-size:0.75rem; color:var(--text-muted);">(${totalLulusKeg}/${totalPesertaKeg})</span>
        </div>
      </td>
      <td>
        <div class="action-cell">
          <button class="btn btn-sm btn-outline-primary" onclick="openDetail('${escapeQuote(keg.kegiatan)}')">
            <i class="fa-solid fa-eye"></i> Detail
          </button>
          ${state.isAdmin ? `
            <button class="btn btn-sm btn-secondary" onclick="openEditKegiatan('${escapeQuote(keg.kegiatan)}')">
              <i class="fa-solid fa-pen"></i>
            </button>
            <button class="btn btn-sm btn-danger" onclick="deleteKegiatan('${escapeQuote(keg.kegiatan)}')">
              <i class="fa-solid fa-trash"></i>
            </button>
          ` : ''}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Filter Logic
function getFilteredData() {
  const filtered = state.kegiatanList.filter(keg => {
    // 1. Search Query
    const query = state.filters.search.toLowerCase().strip();
    let matchesSearch = true;

    if (query !== '') {
      const matchKegiatan = keg.kegiatan.toLowerCase().includes(query);
      const matchPengajar = keg.angkatan.some(a => a.pengajar.some(p => p.toLowerCase().includes(query)));
      const matchTempat = keg.angkatan.some(a => a.tempat.toLowerCase().includes(query));
      const matchWaktu = keg.angkatan.some(a => a.waktu_pelaksanaan.toLowerCase().includes(query));

      matchesSearch = matchKegiatan || matchPengajar || matchTempat || matchWaktu;
    }

    // 2. Filter Triwulan
    let matchesTriwulan = true;
    if (state.filters.triwulan !== 'all') {
      matchesTriwulan = keg.angkatan.some(a => a.triwulan.includes(state.filters.triwulan));
    }

    // 3. Filter Tahun
    let matchesTahun = true;
    if (state.filters.tahun !== 'all') {
      matchesTahun = keg.angkatan.some(a => a.tahun && a.tahun.toString() === state.filters.tahun);
    }

    // 4. Filter Dokumen
    let matchesDokumen = true;
    if (state.filters.dokumen !== 'all') {
      const isLengkap = keg.angkatan.every(ang => {
        return Object.keys(DOCUMENT_LABELS).every(key => ang.documents && ang.documents[key]);
      });

      if (state.filters.dokumen === 'lengkap') {
        matchesDokumen = isLengkap;
      } else if (state.filters.dokumen === 'belum') {
        matchesDokumen = !isLengkap;
      }
    }

    return matchesSearch && matchesTriwulan && matchesTahun && matchesDokumen;
  });

  // Urutkan berdasarkan no urut (keg.no) dari terkecil ke terbesar
  return filtered.sort((a, b) => {
    const numA = parseInt(a.no) || 0;
    const numB = parseInt(b.no) || 0;
    return numA - numB;
  });
}

// --- Detail Modal Rendering ---
window.openDetail = function (kegiatanName) {
  const keg = state.kegiatanList.find(item => item.kegiatan === kegiatanName);
  if (!keg) return;

  state.selectedKegiatanId = keg.kegiatan;
  state.selectedAngkatanIndex = 0;

  document.getElementById('detail-no').innerText = keg.no || "#";
  document.getElementById('detail-title').innerText = keg.kegiatan;

  renderAngkatanTabs(keg);
  renderSelectedAngkatanDetails();

  openModal('modal-detail');
};

function renderAngkatanTabs(keg) {
  const tabsList = document.getElementById('angkatan-tabs');
  tabsList.innerHTML = '';

  keg.angkatan.forEach((ang, idx) => {
    const btn = document.createElement('button');
    btn.className = `tab-btn ${idx === state.selectedAngkatanIndex ? 'active' : ''}`;
    btn.innerText = `Akt ${ang.akt}`;
    btn.onclick = () => {
      state.selectedAngkatanIndex = idx;
      // update active tabs
      document.querySelectorAll('.tab-btn').forEach((b, i) => {
        b.classList.toggle('active', i === idx);
      });
      renderSelectedAngkatanDetails();
    };
    tabsList.appendChild(btn);
  });

  // Show / Hide Add Angkatan button based on admin mode
  const btnAddAngk = document.getElementById('btn-add-angkatan');
  if (state.isAdmin) {
    btnAddAngk.classList.remove('hidden');
    btnAddAngk.onclick = () => openAddAngkatan(keg.kegiatan);
  } else {
    btnAddAngk.classList.add('hidden');
  }
}

function renderSelectedAngkatanDetails() {
  const pane = document.getElementById('angkatan-details-pane');
  pane.innerHTML = '';

  const keg = state.kegiatanList.find(item => item.kegiatan === state.selectedKegiatanId);
  if (!keg || keg.angkatan.length === 0) {
    pane.innerHTML = `<p class="no-data-alert">Belum ada data Angkatan untuk pelatihan ini.</p>`;
    return;
  }

  const ang = keg.angkatan[state.selectedAngkatanIndex];
  if (!ang) return;

  // Doc completeness stats
  let totalDocs = Object.keys(DOCUMENT_LABELS).length;
  let presentDocs = 0;
  Object.keys(DOCUMENT_LABELS).forEach(key => {
    if (ang.documents && ang.documents[key]) presentDocs++;
  });
  const docPercent = Math.round((presentDocs / totalDocs) * 100);

  // Create Teachers HTML
  const teachersHtml = ang.pengajar && ang.pengajar.length > 0
    ? ang.pengajar.map(t => `<span class="count-badge" style="background:#e2e8f0; color:#1e293b; margin:2px; display:inline-block;">${escapeHtml(t)}</span>`).join(' ')
    : '<em>Tidak ada data pengajar</em>';

  let infoHtml = `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap: 1rem;">
      <h3 style="font-size:1.15rem; color:var(--color-primary-dark)">Informasi Angkatan ${ang.akt}</h3>
      ${state.isAdmin ? `
        <div style="display:flex; gap:0.5rem;">
          <button class="btn btn-sm btn-outline-primary" onclick="openEditAngkatan(${state.selectedAngkatanIndex})">
            <i class="fa-solid fa-pen"></i> Edit Detail Angkatan
          </button>
          <button class="btn btn-sm btn-danger" onclick="deleteAngkatan(${state.selectedAngkatanIndex})">
            <i class="fa-solid fa-trash"></i> Hapus Angkatan
          </button>
        </div>
      ` : ''}
    </div>
    
    <div class="batch-info-grid">
      <div class="info-item">
        <label>Waktu Pelaksanaan</label>
        <span>${escapeHtml(ang.waktu_pelaksanaan || '-')}</span>
      </div>
      <div class="info-item">
        <label>Triwulan &amp; Tahun</label>
        <span>Triwulan ${escapeHtml(ang.triwulan || '-')}${ang.tahun ? ' &mdash; Tahun ' + escapeHtml(ang.tahun.toString()) : ''}</span>
      </div>
      <div class="info-item">
        <label>Tempat</label>
        <span><i class="fa-solid fa-location-dot"></i> ${escapeHtml(ang.tempat || '-')}</span>
      </div>
      <div class="info-item">
        <label>Durasi & JP</label>
        <span>${escapeHtml(ang.jumlah_hari || '-')} / ${escapeHtml(ang.jumlah_jp || '-')} JP (${escapeHtml(ang.jp_berbayar || '-')})</span>
      </div>
      <div class="info-item">
        <label>Statistik Peserta</label>
        <span>Total: ${ang.total_peserta || 0} | Lulus: <strong style="color:var(--color-success)">${ang.lulus || 0}</strong> | Tidak Lulus: <strong style="color:var(--color-danger)">${ang.tidak_lulus || '-'}</strong> | Rasio Kelulusan: <strong style="color:var(--color-primary)">${(() => { const p = parseInt(ang.total_peserta) || 0; const l = parseInt(ang.lulus); return (p > 0 && !isNaN(l)) ? Math.round((l / p) * 100) + '%' : '-'; })()}</strong></span>
      </div>
    </div>
    
    <div style="margin-bottom:2rem;">
      <h4 style="font-size:0.875rem; color:var(--text-muted); text-transform:uppercase; margin-bottom:0.5rem; font-weight:700;">Daftar Pengajar / Narasumber</h4>
      <div>${teachersHtml}</div>
    </div>
    
    <div class="docs-checklist-section">
      <h3><i class="fa-solid fa-file-invoice"></i> Kelengkapan Dokumen Administrasi</h3>
      
      <div class="docs-summary-bar">
        <span>Rasio Kelengkapan: ${presentDocs} dari ${totalDocs} Dokumen (${docPercent}%)</span>
        <div class="docs-progress-container">
          <div class="docs-progress-bar" style="width: ${docPercent}%"></div>
        </div>
      </div>
      
      <div class="docs-grid">
  `;

  // Definisikan urutan ketat dokumen sesuai urutan kolom Spreadsheet (P s.d. AO)
  const DOCUMENT_ORDER = [
    "kurikulum",                   // P
    "kak",                         // Q
    "undangan_rapat_persiapan",    // R
    "notulen_rapat_persiapan",     // S
    "permohonan_narsum",           // T
    "surat_permohonan_peserta",    // U
    "panggilan_peserta",           // V
    "sk_penunjukan",               // W
    "st_penyelenggara",            // X
    "st_wi",                       // Y
    "undangan_rapat_evaluasi",     // Z
    "notulen_rapat_evaluasi",      // AA
    "berita_acara_evaluasi",       // AB
    "sk_penetapan",                // AC
    "surat_pengembalian_peserta",  // AD
    "rekap_nilai",                 // AE
    "absensi",                     // AF
    "biodata_pengajar",            // AG
    "daftar_hadir_narsum",         // AH
    "daftar_hadir_penyelenggara",  // AI
    "ktp_npwp",                    // AJ
    "materi",                      // AK
    "jadwal",                      // AL
    "laporan_akhir",               // AM
    "dokumentasi",                 // AN
    "hasil_evaluasi"               // AO
  ];

  // Saring hanya key yang terdaftar di DOCUMENT_LABELS
  const sortedDocKeys = DOCUMENT_ORDER.filter(k => DOCUMENT_LABELS[k] !== undefined);
  
  // Jika ada jenis dokumen baru yang dibuat admin lewat menu kelola, tambahkan di akhir
  Object.keys(DOCUMENT_LABELS).forEach(k => {
    if (!sortedDocKeys.includes(k)) {
      sortedDocKeys.push(k);
    }
  });

  sortedDocKeys.forEach((key, dIdx) => {
    const label = DOCUMENT_LABELS[key];
    const file = ang.documents ? ang.documents[key] : null;
    const isAvail = !!file;
    const iconClass = isAvail ? 'fa-solid fa-check' : 'fa-solid fa-xmark';
    const statusClass = isAvail ? 'available' : 'missing';

    let fileLinkHtml = '<em>Belum diunggah</em>';

    if (isAvail) {
      if (typeof file === 'object' && file !== null && !Array.isArray(file)) {
        const fName = file.name || '';
        const fUrl = file.url || '';
        fileLinkHtml = `
          <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:0.5rem;">
            <span class="doc-filename" style="max-width:180px;" title="${escapeHtml(fName)}">${escapeHtml(fName)}</span>
            <button class="doc-download-btn doc-action-btn" data-filename="${escapeHtml(fName)}" data-url="${escapeHtml(fUrl)}" title="Buka Tautan Langsung">
              <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.875rem;"></i>
            </button>
          </div>
        `;
      } else if (Array.isArray(file)) {
        fileLinkHtml = file.map(f => `
          <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:0.5rem; margin-top:4px;">
            <span class="doc-filename" style="max-width:180px;" title="${escapeHtml(f)}">${escapeHtml(f)}</span>
            <button class="doc-download-btn doc-action-btn" data-filename="${escapeHtml(f)}" data-url="" title="Cari & Unduh dari Drive">
              <i class="fa-solid fa-cloud-arrow-down" style="font-size:0.875rem;"></i>
            </button>
          </div>
        `).join('');
      } else {
        let isDirectUrl = false;
        if (typeof file === 'string' && file.toLowerCase().startsWith('http')) {
          isDirectUrl = true;
        }

        if (isDirectUrl) {
          fileLinkHtml = `
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:0.5rem;">
              <span class="doc-filename" style="max-width:180px;" title="${escapeHtml(file)}">Tautan Dokumen</span>
              <button class="doc-download-btn doc-action-btn" data-filename="Dokumen" data-url="${escapeHtml(file)}" title="Buka Tautan Langsung">
                <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.875rem;"></i>
              </button>
            </div>
          `;
        } else {
          fileLinkHtml = `
            <div style="display:flex; justify-content:space-between; align-items:center; width:100%; gap:0.5rem;">
              <span class="doc-filename" style="max-width:180px;" title="${escapeHtml(file)}">${escapeHtml(file)}</span>
              <button class="doc-download-btn doc-action-btn" data-filename="${escapeHtml(file)}" data-url="" title="Cari & Unduh dari Drive">
                <i class="fa-solid fa-cloud-arrow-down" style="font-size:0.875rem;"></i>
              </button>
            </div>
          `;
        }
      }
    }

    infoHtml += `
      <div class="doc-card">
        <div class="doc-status-icon ${statusClass}">
          <i class="${iconClass}"></i>
        </div>
        <div class="doc-details" style="width: 100%;">
          <span class="doc-name">${dIdx + 1}. ${label}</span>
          ${fileLinkHtml}
        </div>
      </div>
    `;
  });

  infoHtml += `
      </div>
    </div>
  `;

  pane.innerHTML = infoHtml;
}

// --- Admin Authentication ---
function setupEventListeners() {
  // Search and Filter Events
  document.getElementById('search-input').addEventListener('input', (e) => {
    state.filters.search = e.target.value;
    renderApp();
  });

  document.getElementById('filter-triwulan').addEventListener('change', (e) => {
    state.filters.triwulan = e.target.value;
    renderApp();
  });

  const filterTahun = document.getElementById('filter-tahun');
  if (filterTahun) {
    filterTahun.addEventListener('change', (e) => {
      state.filters.tahun = e.target.value;
      renderApp();
    });
  }

  document.getElementById('filter-dokumen').addEventListener('change', (e) => {
    state.filters.dokumen = e.target.value;
    renderApp();
  });

  // Sync Button Click — ambil data terbaru dari Firebase
  const btnSync = document.getElementById('btn-sync');
  if (btnSync) {
    btnSync.addEventListener('click', () => syncFromFirebase());
  }

  // Login Button Click
  document.getElementById('btn-login-toggle').addEventListener('click', () => {
    if (state.isAdmin) {
      // Logout
      state.isAdmin = false;
      sessionStorage.removeItem('admin_session');
      updateAdminUI(false);
      renderApp();
    } else {
      openModal('modal-login');
    }
  });

  // Delegated event listener for dynamic document action buttons
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.doc-action-btn');
    if (btn) {
      const filename = btn.getAttribute('data-filename') || '';
      const url = btn.getAttribute('data-url') || '';
      viewOrDownloadFile(filename, url);
    }
  });

  // Submit Login
  document.getElementById('login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('login-username').value;
    const pass = document.getElementById('login-password').value;

    if (user === 'admin' && pass === 'adminpelatihan123') {
      state.isAdmin = true;
      sessionStorage.setItem('admin_session', 'active');
      updateAdminUI(true);
      closeModal('modal-login');
      renderApp();
      // Clear credentials form
      document.getElementById('login-username').value = '';
      document.getElementById('login-password').value = '';
      document.getElementById('login-error-msg').classList.add('hidden');
    } else {
      document.getElementById('login-error-msg').classList.remove('hidden');
    }
  });

  // Kegiatan Add/Edit Submit
  document.getElementById('kegiatan-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('form-kegiatan-id').value;
    const no = document.getElementById('form-kegiatan-no').value;
    const nama = document.getElementById('form-kegiatan-nama').value;

    if (id) {
      // Edit
      const item = state.kegiatanList.find(k => k.kegiatan === id);
      if (item) {
        item.no = no;
        item.kegiatan = nama;
      }
    } else {
      // Add
      state.kegiatanList.push({
        no: no,
        kegiatan: nama,
        jumlah_akt: "0",
        angkatan: []
      });
    }

    saveToLocalStorage();
    closeModal('modal-kegiatan-form');
    renderApp();
  });

  // Angkatan Form Submit
  document.getElementById('angkatan-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const kegId = document.getElementById('form-angkatan-kegiatan-id').value;
    const indexStr = document.getElementById('form-angkatan-index').value;

    const keg = state.kegiatanList.find(k => k.kegiatan === kegId);
    if (!keg) return;

    const teachersRaw = document.getElementById('form-akt-pengajar').value;
    const teachers = teachersRaw.split('\n').map(t => t.strip()).filter(t => t !== '');

    // Parse Documents inputs
    const docs = {};
    Object.keys(DOCUMENT_LABELS).forEach(key => {
      const val = document.getElementById(`doc-${key}`).value.strip();
      docs[key] = val !== '' ? val : null;
    });

    const from_date = document.getElementById('form-akt-from').value.strip();
    const to_date = document.getElementById('form-akt-to').value.strip();
    let waktu = from_date;
    if (to_date !== '') {
      waktu = `${from_date} s.d. ${to_date}`;
    }

    const batchData = {
      akt: document.getElementById('form-akt-no').value.strip(),
      waktu_pelaksanaan: waktu,
      from_date: from_date,
      to_date: to_date,
      triwulan: document.getElementById('form-akt-triwulan').value,
      tahun: document.getElementById('form-akt-tahun').value || '',
      jumlah_hari: document.getElementById('form-akt-hari').value.strip(),
      jumlah_jp: document.getElementById('form-akt-jp').value.strip(),
      jp_berbayar: document.getElementById('form-akt-jp-bayar').value.strip(),
      total_peserta: document.getElementById('form-akt-peserta').value,
      lulus: document.getElementById('form-akt-lulus').value,
      tidak_lulus: document.getElementById('form-akt-tidak-lulus').value.strip(),
      pengajar: teachers,
      tempat: document.getElementById('form-akt-tempat').value.strip(),
      documents: docs
    };

    if (indexStr === '') {
      // Add new batch
      keg.angkatan.push(batchData);
      keg.jumlah_akt = keg.angkatan.length.toString();
    } else {
      // Edit existing batch
      const idx = parseInt(indexStr);
      keg.angkatan[idx] = batchData;
    }

    saveToLocalStorage();
    closeModal('modal-angkatan-form');

    // Refresh details modal
    renderAngkatanTabs(keg);
    renderSelectedAngkatanDetails();
    renderApp();
  });

  // Btn Add Kegiatan click
  document.getElementById('btn-add-kegiatan').addEventListener('click', () => {
    document.getElementById('kegiatan-form-title').innerText = 'Tambah Pelatihan Baru';
    document.getElementById('form-kegiatan-id').value = '';
    document.getElementById('form-kegiatan-no').value = (state.kegiatanList.length + 1).toString();
    document.getElementById('form-kegiatan-nama').value = '';
    openModal('modal-kegiatan-form');
  });

  // === Auto-sync Peserta / Lulus / Tidak Lulus ===
  const formPeserta = document.getElementById('form-akt-peserta');
  const formLulus = document.getElementById('form-akt-lulus');
  const formTidakLulus = document.getElementById('form-akt-tidak-lulus');

  // Ketika total peserta berubah, update lulus = peserta - tidak_lulus (jika tidak_lulus angka)
  formPeserta.addEventListener('input', () => {
    const peserta = parseInt(formPeserta.value) || 0;
    const tidakLulus = parseInt(formTidakLulus.value);
    if (!isNaN(tidakLulus) && tidakLulus >= 0) {
      formLulus.value = Math.max(0, peserta - tidakLulus);
    }
  });

  // Ketika lulus berubah, update tidak_lulus = peserta - lulus
  formLulus.addEventListener('input', () => {
    const peserta = parseInt(formPeserta.value) || 0;
    const lulus = parseInt(formLulus.value) || 0;
    const tidakLulus = Math.max(0, peserta - lulus);
    formTidakLulus.value = tidakLulus > 0 ? tidakLulus.toString() : '-';
  });

  // Ketika tidak_lulus berubah (angka), update lulus = peserta - tidak_lulus
  formTidakLulus.addEventListener('input', () => {
    const peserta = parseInt(formPeserta.value) || 0;
    const val = formTidakLulus.value.trim();
    const tidakLulus = parseInt(val);
    if (!isNaN(tidakLulus) && tidakLulus >= 0) {
      formLulus.value = Math.max(0, peserta - tidakLulus);
    }
  });

  // Btn Manage Docs click
  const btnManageDocs = document.getElementById('btn-manage-docs');
  if (btnManageDocs) {
    btnManageDocs.addEventListener('click', () => {
      renderManageDocsModal();
      openModal('modal-manage-docs');
    });
  }

  // Btn Add Doc Type click inside manage modal
  const btnAddDocType = document.getElementById('btn-add-doc-type');
  if (btnAddDocType) {
    btnAddDocType.addEventListener('click', () => {
      const container = document.getElementById('doc-types-list-container');
      if (!container) return;
      
      const index = container.querySelectorAll('.doc-type-item').length;
      // Generate a simple unique key
      const randomKey = 'doc_' + Math.random().toString(36).substr(2, 9);
      
      const itemDiv = document.createElement('div');
      itemDiv.style.display = 'flex';
      itemDiv.style.alignItems = 'center';
      itemDiv.style.gap = '0.5rem';
      itemDiv.className = 'doc-type-item';
      itemDiv.dataset.key = randomKey;
      
      itemDiv.innerHTML = `
        <span style="font-weight: 600; min-width: 24px;">${index + 1}.</span>
        <input type="text" class="form-control doc-type-input" value="" style="flex: 1; padding: 0.5rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm);" placeholder="Contoh: Surat Pertanggungjawaban">
        <button type="button" class="btn btn-sm btn-danger btn-delete-doc-type" title="Hapus" style="padding: 0.5rem 0.75rem;">
          <i class="fa-solid fa-trash"></i>
        </button>
      `;
      container.appendChild(itemDiv);
    });
  }

  // Delete Doc Type delegation
  const docTypesListContainer = document.getElementById('doc-types-list-container');
  if (docTypesListContainer) {
    docTypesListContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-delete-doc-type');
      if (btn) {
        const item = btn.closest('.doc-type-item');
        if (item) {
          item.remove();
          // Re-number remaining items
          const items = docTypesListContainer.querySelectorAll('.doc-type-item');
          items.forEach((it, idx) => {
            it.querySelector('span').textContent = `${idx + 1}.`;
          });
        }
      }
    });
  }

  // Save Doc Types click
  const btnSaveDocTypes = document.getElementById('btn-save-doc-types');
  if (btnSaveDocTypes) {
    btnSaveDocTypes.addEventListener('click', async () => {
      const items = document.querySelectorAll('.doc-type-item');
      const newLabels = {};
      
      items.forEach(item => {
        const key = item.dataset.key;
        const inputVal = item.querySelector('.doc-type-input').value.strip();
        if (inputVal !== '') {
          newLabels[key] = inputVal;
        }
      });
      
      if (Object.keys(newLabels).length === 0) {
        alert("Harus ada minimal 1 jenis dokumen!");
        return;
      }
      
      DOCUMENT_LABELS = newLabels;
      
      // Simpan ke LocalStorage dan Firebase
      await saveToLocalStorage();
      
      closeModal('modal-manage-docs');
      renderApp();
      alert("Daftar jenis dokumen berhasil diperbarui!");
    });
  }
}

// Render list of documents in the management modal
function renderManageDocsModal() {
  const container = document.getElementById('doc-types-list-container');
  if (!container) return;
  container.innerHTML = '';
  
  Object.entries(DOCUMENT_LABELS).forEach(([key, label], index) => {
    const itemDiv = document.createElement('div');
    itemDiv.style.display = 'flex';
    itemDiv.style.alignItems = 'center';
    itemDiv.style.gap = '0.5rem';
    itemDiv.className = 'doc-type-item';
    itemDiv.dataset.key = key;
    
    itemDiv.innerHTML = `
      <span style="font-weight: 600; min-width: 24px;">${index + 1}.</span>
      <input type="text" class="form-control doc-type-input" value="${escapeHtml(label)}" style="flex: 1; padding: 0.5rem; border: 1px solid var(--color-border); border-radius: var(--radius-sm);" placeholder="Nama dokumen">
      <button type="button" class="btn btn-sm btn-danger btn-delete-doc-type" title="Hapus" style="padding: 0.5rem 0.75rem;">
        <i class="fa-solid fa-trash"></i>
      </button>
    `;
    container.appendChild(itemDiv);
  });
}

function updateAdminUI(isAdminActive) {
  const btnLogin = document.getElementById('btn-login-toggle');
  const badge = document.getElementById('admin-status');
  const btnAdd = document.getElementById('btn-add-kegiatan');
  const btnMigrate = document.getElementById('btn-migrate-firebase');
  const btnManageDocs = document.getElementById('btn-manage-docs');

  if (isAdminActive) {
    btnLogin.className = 'btn btn-danger btn-login';
    btnLogin.innerHTML = '<i class="fa-solid fa-unlock-keyhole"></i> <span>Keluar Admin</span>';
    badge.classList.remove('hidden');
    btnAdd.classList.remove('hidden');
    if (btnManageDocs) btnManageDocs.classList.remove('hidden');
    if (btnMigrate) btnMigrate.classList.remove('hidden');
  } else {
    btnLogin.className = 'btn btn-primary btn-login';
    btnLogin.innerHTML = '<i class="fa-solid fa-lock"></i> <span>Login Admin</span>';
    badge.classList.add('hidden');
    btnAdd.classList.add('hidden');
    if (btnManageDocs) btnManageDocs.classList.add('hidden');
    if (btnMigrate) btnMigrate.classList.add('hidden');
  }
}

// --- CRUD Kegiatan Actions ---
window.openEditKegiatan = function (kegiatanName) {
  const keg = state.kegiatanList.find(k => k.kegiatan === kegiatanName);
  if (!keg) return;

  document.getElementById('kegiatan-form-title').innerText = 'Edit Kegiatan Pelatihan';
  document.getElementById('form-kegiatan-id').value = keg.kegiatan;
  document.getElementById('form-kegiatan-no').value = keg.no;
  document.getElementById('form-kegiatan-nama').value = keg.kegiatan;

  openModal('modal-kegiatan-form');
};

window.deleteKegiatan = function (kegiatanName) {
  if (confirm(`Apakah Anda yakin ingin menghapus pelatihan "${kegiatanName}" beserta semua angkatannya?`)) {
    state.kegiatanList = state.kegiatanList.filter(k => k.kegiatan !== kegiatanName);
    saveToLocalStorage();
    renderApp();
  }
};

// Render document input fields dynamically in the angkatan form modal
function renderFormDocumentFields(ang = null) {
  const container = document.querySelector('.grid-form-docs');
  if (!container) return;
  container.innerHTML = '';
  
  Object.entries(DOCUMENT_LABELS).forEach(([key, label], index) => {
    let displayVal = '';
    if (ang && ang.documents) {
      const docVal = ang.documents[key];
      if (typeof docVal === 'object' && docVal !== null && !Array.isArray(docVal)) {
        displayVal = docVal.url || docVal.name || '';
      } else if (Array.isArray(docVal)) {
        displayVal = docVal.join('\n');
      } else {
        displayVal = docVal || '';
      }
    }
    
    const div = document.createElement('div');
    div.className = 'form-group';
    div.innerHTML = `
      <label for="doc-${key}">${index + 1}. ${escapeHtml(label)}</label>
      <input type="text" id="doc-${key}" value="${escapeHtml(displayVal)}" placeholder="Link file ${escapeHtml(label.toLowerCase())}">
    `;
    container.appendChild(div);
  });
}

// --- CRUD Angkatan Actions ---
window.openAddAngkatan = function (kegiatanName) {
  const keg = state.kegiatanList.find(k => k.kegiatan === kegiatanName);
  if (!keg) return;

  document.getElementById('angkatan-form-title').innerText = `Tambah Angkatan Baru - ${keg.kegiatan}`;
  document.getElementById('form-angkatan-kegiatan-id').value = keg.kegiatan;
  document.getElementById('form-angkatan-index').value = '';

  // Reset form inputs
  document.getElementById('form-akt-no').value = (keg.angkatan.length + 1).toString();
  document.getElementById('form-akt-triwulan').value = 'I';
  document.getElementById('form-akt-tahun').value = new Date().getFullYear().toString();
  document.getElementById('form-akt-from').value = '';
  document.getElementById('form-akt-to').value = '';
  document.getElementById('form-akt-hari').value = '5 Hari';
  document.getElementById('form-akt-jp').value = '48';
  document.getElementById('form-akt-jp-bayar').value = '';
  document.getElementById('form-akt-peserta').value = '30';
  document.getElementById('form-akt-lulus').value = '0';
  document.getElementById('form-akt-tidak-lulus').value = '0';
  document.getElementById('form-akt-tempat').value = 'Stikes PKP';
  document.getElementById('form-akt-pengajar').value = '';

  renderFormDocumentFields(null);

  openModal('modal-angkatan-form');
};

window.openEditAngkatan = function (index) {
  const keg = state.kegiatanList.find(k => k.kegiatan === state.selectedKegiatanId);
  if (!keg) return;

  const ang = keg.angkatan[index];
  if (!ang) return;

  document.getElementById('angkatan-form-title').innerText = `Edit Angkatan ${ang.akt} - ${keg.kegiatan}`;
  document.getElementById('form-angkatan-kegiatan-id').value = keg.kegiatan;
  document.getElementById('form-angkatan-index').value = index.toString();

  // Populate form inputs
  document.getElementById('form-akt-no').value = ang.akt || '';
  document.getElementById('form-akt-triwulan').value = ang.triwulan || 'I';
  document.getElementById('form-akt-tahun').value = ang.tahun || '';
  document.getElementById('form-akt-from').value = ang.from_date || '';
  document.getElementById('form-akt-to').value = ang.to_date || '';
  document.getElementById('form-akt-hari').value = ang.jumlah_hari || '';
  document.getElementById('form-akt-jp').value = ang.jumlah_jp || '';
  document.getElementById('form-akt-jp-bayar').value = ang.jp_berbayar || '';
  document.getElementById('form-akt-peserta').value = ang.total_peserta || '0';
  document.getElementById('form-akt-lulus').value = ang.lulus || '0';
  document.getElementById('form-akt-tidak-lulus').value = ang.tidak_lulus || '';
  document.getElementById('form-akt-tempat').value = ang.tempat || '';
  document.getElementById('form-akt-pengajar').value = ang.pengajar ? ang.pengajar.join('\n') : '';

  renderFormDocumentFields(ang);

  openModal('modal-angkatan-form');
};

window.deleteAngkatan = function (index) {
  const keg = state.kegiatanList.find(k => k.kegiatan === state.selectedKegiatanId);
  if (!keg) return;

  if (confirm(`Apakah Anda yakin ingin menghapus Angkatan ${keg.angkatan[index].akt}?`)) {
    keg.angkatan.splice(index, 1);
    keg.jumlah_akt = keg.angkatan.length.toString();
    saveToLocalStorage();

    // Close modal if no batches left, otherwise reload tabs
    if (keg.angkatan.length === 0) {
      closeModal('modal-detail');
    } else {
      state.selectedAngkatanIndex = 0;
      renderAngkatanTabs(keg);
      renderSelectedAngkatanDetails();
    }
    renderApp();
  }
};

// --- Modal Helper Functions ---
window.openModal = function (modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('active');
  }
};

window.closeModal = function (modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('active');
  }
};

// Close modals when clicking outside the box
window.addEventListener('click', (e) => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('active');
  }
});

// --- Utility Functions ---
function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeQuote(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/'/g, "\\'");
}

// Helpers to clean strings
String.prototype.strip = function () {
  return this.trim();
};

// Menampilkan dokumen dalam iframe (popup)
function openDocumentViewer(url, title) {
  const modal = document.getElementById('modal-document-viewer');
  const iframe = document.getElementById('document-viewer-iframe');
  const titleEl = document.getElementById('document-viewer-title');
  const btnExternal = document.getElementById('btn-open-external');
  const btnDownload = document.getElementById('btn-download-doc');
  
  // Convert standard Drive URLs to preview URLs to allow embedding
  let embedUrl = url;
  if (url.includes('drive.google.com/file/d/')) {
    embedUrl = url.replace(/\/view.*$/, '/preview');
  }

  iframe.src = embedUrl;
  titleEl.innerText = title || "Pratinjau Dokumen";
  btnExternal.onclick = () => window.open(url, '_blank');
  
  // Konfigurasi link download langsung untuk Google Drive
  let downloadUrl = url;
  if (url.includes('drive.google.com/file/d/')) {
    const matches = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (matches && matches[1]) {
      downloadUrl = `https://drive.google.com/uc?export=download&id=${matches[1]}`;
    }
  }
  
  if (btnDownload) {
    btnDownload.onclick = () => window.open(downloadUrl, '_blank');
  }
  
  modal.classList.add('active');
}

// Aksi unduh/buka file dari Google Drive secara dinamis
async function viewOrDownloadFile(filename, directUrl) {
  if (directUrl) {
    openDocumentViewer(directUrl, filename || "Dokumen");
    return;
  }
  
  if (!APPS_SCRIPT_URL) {
    alert("Google Apps Script URL belum terkonfigurasi. Berkas: " + filename);
    return;
  }
  
  showLoading(true, `Mencari "${filename}" di Google Drive...`);
  try {
    const fetchUrl = APPS_SCRIPT_URL + (APPS_SCRIPT_URL.includes('?') ? '&' : '?') + 
      'action=getFile&filename=' + encodeURIComponent(filename);
      
    const response = await fetchWithJSONP(fetchUrl);
    if (response && response.found && response.url) {
      openDocumentViewer(response.url, filename);
    } else {
      // Fallback ke pencarian jika tidak ditemukan atau Apps Script belum diotorisasi
      const driveSearchUrl = 'https://drive.google.com/drive/search?q=' + encodeURIComponent(filename);
      openDocumentViewer(driveSearchUrl, `Pencarian: ${filename}`);
    }
  } catch (err) {
    console.error("Gagal melakukan pencarian file spesifik, fallback ke pencarian:", err);
    const driveSearchUrl = 'https://drive.google.com/drive/search?q=' + encodeURIComponent(filename);
    openDocumentViewer(driveSearchUrl, `Pencarian: ${filename}`);
  } finally {
    showLoading(false);
  }
}
