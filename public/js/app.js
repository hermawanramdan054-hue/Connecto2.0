/**
 * app.js (v8 — Saran Otomatis Tamu Hotel + Tier Per-Metrik + Header Tabel ID)
 * ------------------------------------------------------------
 * Perubahan v8:
 *  - [POIN 6] computeMetricTier()/fmtMetricCell(): angka Download & Upload di tabel
 *    sekarang diwarnai dinamis per-metrik (bukan cuma badge Status gabungan).
 *  - [POIN 8] HOTEL_SUGGESTION_MATRIX + getHotelSuggestion() + kotak #hotelSuggestionBox:
 *    Saran Otomatis untuk tamu hotel muncul otomatis begitu 1 pengujian selesai.
 * ------------------------------------------------------------
 * Perubahan utama dari versi sebelumnya:
 *  - [POIN 1] Tabel Laporan sekarang dirender per-SET (3 sub-baris Gateway:
 *    Objective/Domestik/Internasional), kolom Time/Area/Download/Upload/Status/Aksi
 *    pakai rowspan="3" supaya menyatu vertikal.
 *  - [POIN 2] Badge status 4 kategori: Excellent/Very Good/Good/Poor (computeStatus()).
 *  - [POIN 3] Tombol Start & Stop berdampingan. Stop mengirim 'stop-test' ke server
 *    untuk membunuh proses backend yang sedang berjalan, progress bar berhenti
 *    instan, status jadi "Pengecekan Dibatalkan", TIDAK menyimpan laporan.
 *  - [POIN 4] Seluruh rangkaian (3x ping 100x ke 3 target + 3x Speedtest) sekarang
 *    dipicu lewat SATU event 'test:start' & dijalankan penuh di server — client
 *    tinggal mendengarkan event progres ('test:phase', 'test:ping-progress',
 *    'speedtest:*', 'test:result', 'test:error', 'test:cancelled', 'test:stopped').
 *  - [POIN 5] Average & Ping (Min–Max) per Gateway dihitung dinamis di server
 *    (Math.min/Math.max dari data ping sungguhan) — tidak ada nilai statis.
 * ------------------------------------------------------------
 */

const socket = io();

// ============================================================
// STATUS KONEKSI SOCKET
// ============================================================
const socketDot = document.getElementById('socketDot');
const socketStatusText = document.getElementById('socketStatusText');
socket.on('connect', () => { socketDot.className = 'dot ok'; socketStatusText.textContent = 'Terhubung (realtime)'; });
socket.on('disconnect', () => { socketDot.className = 'dot bad'; socketStatusText.textContent = 'Terputus'; });

// ============================================================
// JENDELA 1 — PENGUJIAN: Area + Ping Domestik + Ping Internasional + Speedtest
// ============================================================
const selArea = document.getElementById('selArea');
const selDomestik = document.getElementById('selDomestik');
const selInternasional = document.getElementById('selInternasional');
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const ujiProgress = document.getElementById('ujiProgress');
const ujiStatusText = document.getElementById('ujiStatusText');

// [POIN 3] Panel Live Stats — 6 kartu: Download(Avg)/Upload(Avg)/Ping/Jitter/Minimum/Maximum.
const rDownload = document.getElementById('rDownload');
const rUpload = document.getElementById('rUpload');
const rPing = document.getElementById('rPing');
const rJitter = document.getElementById('rJitter');
const rMin = document.getElementById('rMin');
const rMax = document.getElementById('rMax');
const diagnosisBox = document.getElementById('diagnosisBox');
const diagnosisStatus = document.getElementById('diagnosisStatus');
const diagnosisReason = document.getElementById('diagnosisReason');
const diagnosisAction = document.getElementById('diagnosisAction');

const CUSTOM_AREA_VALUE = '__CUSTOM__';
const CUSTOM_DOM_VALUE = '__CUSTOM_DOM__';
const CUSTOM_INTL_VALUE = '__CUSTOM_INTL__';

const customAreaNameRow = document.getElementById('customAreaNameRow');
const customAreaNameInput = document.getElementById('customAreaNameInput');
const customAreaTargetRow = document.getElementById('customAreaTargetRow');
const customAreaTargetInput = document.getElementById('customAreaTargetInput');

const domestikFieldRow = document.getElementById('domestikFieldRow');
const customDomTargetRow = document.getElementById('customDomTargetRow');
const customDomTargetInput = document.getElementById('customDomTargetInput');

const customIntlTargetRow = document.getElementById('customIntlTargetRow');
const customIntlTargetInput = document.getElementById('customIntlTargetInput');

const roomNumberRow = document.getElementById('roomNumberRow');
const inputRoomNumber = document.getElementById('inputRoomNumber');

async function fillCustomGatewayFromWifi() {
  customAreaTargetInput.placeholder = 'Mendeteksi gateway Wi-Fi...';
  try {
    const response = await fetch('/api/local-gateway');
    const data = await response.json();
    if (data.gateway && selArea.value === CUSTOM_AREA_VALUE) {
      customAreaTargetInput.value = data.gateway;
      customAreaTargetInput.dataset.autoDetected = 'true';
    }
  } catch (error) {
    customAreaTargetInput.dataset.autoDetected = 'false';
  } finally {
    customAreaTargetInput.placeholder = 'cth. 192.168.1.254 atau my-router.local';
  }
}

// Toggle field "Nama Area Target Custom" & Nomor Kamar sesuai opsi Area yang dipilih.
selArea.addEventListener('change', () => {
  const mode = selArea.value;
  const isCustom = mode === CUSTOM_AREA_VALUE;
  const selectedOpt = selArea.selectedOptions[0];
  const isRoomCategory = !isCustom && !!selectedOpt && selectedOpt.dataset.category === 'room';

  customAreaNameRow.hidden = !isCustom;
  customAreaTargetRow.hidden = !isCustom;
  roomNumberRow.hidden = !isRoomCategory;

  // [POIN 4] Dropdown "Ping Domestik" TIDAK PERNAH disembunyikan di sini, apapun pilihan Area.

  if (isCustom) {
    customAreaNameInput.focus();
    fillCustomGatewayFromWifi();
  } else {
    customAreaNameInput.value = '';
    customAreaTargetInput.value = '';
    customAreaTargetInput.dataset.autoDetected = 'false';
  }
  if (!isRoomCategory) inputRoomNumber.value = '';
});

selDomestik.addEventListener('change', () => {
  const isDomCustom = selDomestik.value === CUSTOM_DOM_VALUE;
  customDomTargetRow.hidden = !isDomCustom;
  if (isDomCustom) customDomTargetInput.focus();
  else customDomTargetInput.value = '';
});

selInternasional.addEventListener('change', () => {
  const isIntlCustom = selInternasional.value === CUSTOM_INTL_VALUE;
  customIntlTargetRow.hidden = !isIntlCustom;
  if (isIntlCustom) customIntlTargetInput.focus();
  else customIntlTargetInput.value = '';
});

function isValidHostOrIp(value) {
  const v = value.trim();
  if (!v || v.length > 253) return false;
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
  const m = v.match(ipv4);
  if (m) return m.slice(1).every((oct) => Number(oct) >= 0 && Number(oct) <= 255);
  const hostname = /^[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,251}[a-zA-Z0-9])?$/;
  return hostname.test(v);
}

fetch('/api/ping-targets')
  .then((r) => r.json())
  .then((data) => {
    data.domestik.forEach((t) => {
      const o = document.createElement('option');
      o.value = t.ip; o.textContent = `${t.label} (${t.ip})`; o.dataset.label = t.label;
      selDomestik.appendChild(o);
    });
    data.internasional.forEach((t) => {
      const o = document.createElement('option');
      o.value = t.ip; o.textContent = `${t.label} (${t.ip})`; o.dataset.label = t.label;
      selInternasional.appendChild(o);
    });
  });

function setUjiResultDefaults() {
  rDownload.textContent = '– Mbps';
  rUpload.textContent = '– Mbps';
  rPing.textContent = '–';
  rJitter.textContent = '–';
  rMin.textContent = '–';
  rMax.textContent = '–';
  const box = document.getElementById('hotelSuggestionBox');
  if (box) box.hidden = true;
  if (diagnosisBox) diagnosisBox.hidden = true;
}

// [POIN 3] Format helper untuk kartu Live Stats Ping/Jitter/Minimum/Maximum (dalam ms).
function fmtLiveMs(v) {
  return (v === null || v === undefined || isNaN(v)) ? '–' : `${Number(v).toFixed(1)} ms`;
}

function setControlsRunning(isRunning) {
  btnStart.disabled = isRunning;
  btnStop.disabled = !isRunning;
  selArea.disabled = isRunning;
  selDomestik.disabled = isRunning;
  selInternasional.disabled = isRunning;
}

// ---- [POIN 3] Tombol Start ----
btnStart.addEventListener('click', () => {
  const areaMode = selArea.value;
  if (!areaMode) return alert('Pilih Area terlebih dahulu.');

  const isCustomMode = areaMode === CUSTOM_AREA_VALUE;
  const selectedAreaOpt = selArea.selectedOptions[0];
  const isRoomCategory = !isCustomMode && !!selectedAreaOpt && selectedAreaOpt.dataset.category === 'room';

  let finalAreaLabel = areaMode;
  if (isRoomCategory) {
    const roomNo = inputRoomNumber.value.trim();
    if (roomNo) finalAreaLabel = `${areaMode} - Room ${roomNo}`;
  }

  let customAreaName = '';
  let customAreaGateway = '';
  if (isCustomMode) {
    customAreaName = customAreaNameInput.value.trim();
    if (!customAreaName) return alert('Masukkan Nama Area Target Custom terlebih dahulu.');
    customAreaGateway = customAreaTargetInput.value.trim();
    if (!customAreaGateway) return alert('Masukkan IP / Hostname Target Custom terlebih dahulu.');
    if (!isValidHostOrIp(customAreaGateway)) return alert('Format IP/Hostname tidak valid. Contoh: 192.168.1.254 atau my-router.local');
  }

  // [POIN 4] Ping Domestik WAJIB dipilih SELALU, apapun pilihan Area.
  const isDomCustomMode = selDomestik.value === CUSTOM_DOM_VALUE;
  let domTargetIp, domLabel;
  if (isDomCustomMode) {
    const domCustom = customDomTargetInput.value.trim();
    if (!domCustom) return alert('Masukkan IP / Hostname Target Domestik Custom terlebih dahulu.');
    if (!isValidHostOrIp(domCustom)) return alert('Format IP/Hostname tidak valid. Contoh: 192.168.1.1');
    domTargetIp = domCustom; domLabel = `Domestik Custom (${domCustom})`;
  } else {
    const domOpt = selDomestik.selectedOptions[0];
    if (!domOpt || !domOpt.value) return alert('Pilih Target Ping Domestik terlebih dahulu.');
    domTargetIp = domOpt.value; domLabel = domOpt.dataset.label || domOpt.textContent;
  }

  const isIntlCustomMode = selInternasional.value === CUSTOM_INTL_VALUE;
  let intlTargetIp, intlLabel;
  if (isIntlCustomMode) {
    const intlCustom = customIntlTargetInput.value.trim();
    if (!intlCustom) return alert('Masukkan IP / Hostname Target Internasional Custom terlebih dahulu.');
    if (!isValidHostOrIp(intlCustom)) return alert('Format IP/Hostname tidak valid. Contoh: 8.8.8.8 atau 1.1.1.1');
    intlTargetIp = intlCustom; intlLabel = `Internasional Custom (${intlCustom})`;
  } else {
    const intlOpt = selInternasional.selectedOptions[0];
    if (!intlOpt || !intlOpt.value) return alert('Pilih Target Ping Internasional terlebih dahulu.');
    intlTargetIp = intlOpt.value; intlLabel = intlOpt.dataset.label || intlOpt.textContent;
  }

  setUjiResultDefaults();
  ujiProgress.style.width = '0%';
  setControlsRunning(true);
  ujiStatusText.textContent = 'Memulai pengujian…';

  // [POIN 4 & 5] SATU event terpadu — seluruh rangkaian (3x ping 100x + 3x speedtest)
  // dijalankan & dikendalikan penuh di server.
  socket.emit('test:start', {
    area: isCustomMode ? customAreaName : finalAreaLabel,
    isCustomArea: isCustomMode,
    objectiveTarget: isCustomMode ? customAreaGateway : null,
    domestikTarget: domTargetIp,
    domestikLabel: domLabel,
    internasionalTarget: intlTargetIp,
    internasionalLabel: intlLabel
  });
});

// ---- [POIN 3] Tombol Stop — membunuh proses backend, TIDAK menyimpan laporan ----
btnStop.addEventListener('click', () => {
  socket.emit('stop-test');
  // Hentikan progress bar SECARA INSTAN (tidak menunggu konfirmasi server) supaya
  // terasa responsif; status akhir tetap disesuaikan lagi begitu server balas.
  ujiProgress.style.width = '0%';
  ujiStatusText.textContent = 'Menghentikan pengujian…';
});

function resetControlsAfterStop(message) {
  ujiProgress.style.width = '0%';
  ujiStatusText.textContent = message;
  setControlsRunning(false);
}

socket.on('test:cancelled', () => resetControlsAfterStop('Pengecekan Dibatalkan'));
socket.on('test:stopped', () => resetControlsAfterStop('Pengecekan Dibatalkan'));

socket.on('test:error', ({ message }) => {
  resetControlsAfterStop('Gagal: ' + message);
  alert('Pengujian gagal: ' + message);
});

// ---- Progres tahap PING (3 sub-target berurutan) ----
socket.on('test:phase', ({ phase, stageIndex, totalStages, label }) => {
  if (phase === 'ping') {
    ujiProgress.style.width = ((stageIndex / totalStages) * 100).toFixed(1) + '%';
    ujiStatusText.textContent = `Tahap ${stageIndex + 1}/${totalStages} — Ping ${label} (3 percobaan)`;
  } else if (phase === 'speedtest') {
    ujiProgress.style.width = '75%';
    ujiStatusText.textContent = 'Tahap 4/4 — Speedtest dimulai';
  }
});

socket.on('test:ping-progress', ({ stageIndex, totalStages, label, seq, total }) => {
  const stageProgress = (stageIndex + (seq / total)) / totalStages;
  ujiProgress.style.width = (stageProgress * 100).toFixed(1) + '%';
  ujiStatusText.textContent = `Tahap ${stageIndex + 1}/${totalStages} — Ping ${label}, ${seq}/${total}`;
});

// [POIN 3] Live Stats — panel Ping/Jitter/Minimum/Maximum diperbarui REALTIME setiap satu
// sub-tahap Ping (100x) selesai, dihitung server dari gabungan seluruh sampel ping sungguhan.
socket.on('test:ping-summary', ({ avgMs, jitterMs, minMs, maxMs }) => {
  rPing.textContent = fmtLiveMs(avgMs);
  rJitter.textContent = fmtLiveMs(jitterMs);
  rMin.textContent = fmtLiveMs(minMs);
  rMax.textContent = fmtLiveMs(maxMs);
});

// ---- Progres 4 tahap: Objective, Domestik, Internasional, lalu Speedtest ----
function setSpeedtestSegmentProgress(testNumber, totalRun, fractionWithinSegment) {
  const percent = 75 + fractionWithinSegment * 25;
  ujiProgress.style.width = Math.min(percent, 100).toFixed(2) + '%';
}

socket.on('speedtest:test-progress', ({ testNumber, totalRun, phase, result }) => {
  if (phase === 'running') {
    ujiStatusText.textContent = `Tahap 4/4 — Speedtest${totalRun > 1 ? ` (percobaan ${testNumber}/${totalRun})` : ''}`;
  } else if (phase === 'done' && result) {
    setSpeedtestSegmentProgress(testNumber, totalRun, 1);
    rDownload.textContent = (result.downloadMbps ?? '–') + ' Mbps';
    rUpload.textContent = (result.uploadMbps ?? '–') + ' Mbps';
    ujiStatusText.textContent = `Tes ${testNumber}/${totalRun} selesai (DL: ${result.downloadMbps ?? '–'} Mbps, UL: ${result.uploadMbps ?? '–'} Mbps)`;
  }
});

socket.on('speedtest:progress', ({ testNumber, totalRun, type, progressPercent, instMbps }) => {
  if (progressPercent !== null && progressPercent !== undefined) {
    setSpeedtestSegmentProgress(testNumber, totalRun, progressPercent);
  }
  if (type === 'download' && instMbps) rDownload.textContent = instMbps.toFixed(1) + ' Mbps';
  if (type === 'upload' && instMbps) rUpload.textContent = instMbps.toFixed(1) + ' Mbps';
  ujiStatusText.textContent = `Tahap 4/4 — Speedtest (${type === 'download' ? 'unduh' : 'unggah'})`;
});

socket.on('speedtest:error', ({ message }) => {
  // Speedtest gagal total TIDAK menghentikan seluruh proses — laporan tetap disimpan
  // dengan data ping, hanya Download/Upload/Status jadi kosong (lihat server.js).
  ujiStatusText.textContent = 'Speedtest gagal: ' + message + ' — laporan tetap disimpan dengan data ping.';
});

function renderDiagnosis(diagnosis) {
  if (!diagnosisBox || !diagnosis) return;
  diagnosisBox.hidden = false;
  const isFailed = /Gagal|Tidak Terhubung|Tidak Membalas/i.test(diagnosis.status);
  const isWarning = /Tidak Stabil|Lambat/.test(diagnosis.status);
  diagnosisBox.className = `hotel-suggestion diagnosis-box ${isFailed ? 'diagnosis-failed' : isWarning ? 'diagnosis-warning' : 'diagnosis-ok'}`;
  diagnosisStatus.textContent = diagnosis.status || 'Tidak Ada Data';
  diagnosisReason.textContent = diagnosis.reason || 'Alasan pengujian tidak tersedia.';
  diagnosisAction.textContent = `Saran tindakan: ${diagnosis.action || 'Periksa kembali koneksi dan ulangi pengujian.'}`;
}

// ---- Hasil akhir 1 set pengujian (3 sub-baris Gateway + Download/Upload/Status) ----
socket.on('test:result', (entry) => {
  ujiProgress.style.width = '100%';
  ujiStatusText.textContent = 'Selesai — laporan tersimpan.';
  setControlsRunning(false);

  rDownload.textContent = (entry.downloadMbps ?? '–') + ' Mbps';
  rUpload.textContent = (entry.uploadMbps ?? '–') + ' Mbps';

  // [POIN 3] Live Stats final — konsisten dengan yang sempat tampil realtime lewat
  // 'test:ping-summary' (gabungan seluruh sampel ping Objective+Domestik+Internasional).
  const ps = entry.pingStats || {};
  rPing.textContent = fmtLiveMs(ps.avgMs);
  rJitter.textContent = fmtLiveMs(ps.jitterMs);
  rMin.textContent = fmtLiveMs(ps.minMs);
  rMax.textContent = fmtLiveMs(ps.maxMs);

  // [POIN 8] Tampilkan Saran Otomatis — pakai nilai dari server (entry.hotelSuggestion)
  // kalau tersedia, fallback hitung ulang di client (getHotelSuggestion) supaya tetap
  // tampil walau field itu kosong.
  renderHotelSuggestion(entry.hotelSuggestion || getHotelSuggestion(entry.downloadMbps, entry.uploadMbps));
  renderDiagnosis(entry.diagnosis);
});

// ============================================================
// JENDELA 2 — LAPORAN (tabel ke bawah, rowspan 3 Gateway per set data)
// ============================================================
const reportBody = document.getElementById('reportBody');
// [POIN 2 - KEBERSIHAN CELL] Satu placeholder tunggal ("–" en-dash) dipakai KONSISTEN untuk
// SEMUA nilai kosong di tabel (bukan campuran "-", "--", "." dll) supaya tampilan bersih & rapi.
const EMPTY = '–';
function fmtInt(v) { return (v === null || v === undefined) ? EMPTY : String(v); }
function fmtPacketPercent(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return EMPTY;
  const numericValue = Number(value);
  const total = numericValue <= 3 ? 3 : 100;
  return `${Math.round((numericValue / total) * 100)}%`;
}
// Nilai + satuan (ms/Mbps) — kalau datanya kosong, tampilkan HANYA placeholder tanpa satuan
// menempel (menghindari cell kosong yang "kotor" seperti "– ms").
function fmtMsCell(v, digit = 1) { return (v === null || v === undefined || isNaN(v)) ? EMPTY : `${Number(v).toFixed(digit)} ms`; }
function fmtMbpsCell(v, digit = 1) { return (v === null || v === undefined || isNaN(v)) ? EMPTY : `${Number(v).toFixed(digit)} Mbps`; }
// [POIN 2 - FORMAT PING TUNGGAL] Kolom "Ping" menampilkan SATU angka (hasil ping TERAKHIR
// dari 100x percobaan), BUKAN rentang "min–max" seperti sebelumnya.
function fmtPingSingle(g) {
  return fmtMsCell(g && g.lastMs !== null && g.lastMs !== undefined ? g.lastMs : null);
}

// [DIUBAH - POIN 2] Status 4 kategori — evaluasi HANYA berdasarkan nilai Download (Avg),
// LOGIKA SAMA PERSIS dengan computeStatusLabel() di server.js.
//   EXCELLENT (biru) : Download > 100 Mbps
//   VERY GOOD (hijau): Download 50 - 100 Mbps
//   GOOD (kuning)    : Download 10 - 50 Mbps
//   POOR (merah)     : Download < 10 Mbps
function computeStatus(downloadMbps) {
  if (downloadMbps === null || downloadMbps === undefined || isNaN(downloadMbps)) {
    return { label: 'Tidak Ada Data', cls: 'status-na' };
  }
  if (downloadMbps > 100) return { label: 'Excellent', cls: 'status-excellent' };
  if (downloadMbps >= 50) return { label: 'Very Good', cls: 'status-verygood' };
  if (downloadMbps >= 10) return { label: 'Good', cls: 'status-good' };
  return { label: 'Poor', cls: 'status-poor' };
}

// [DIUBAH - POIN 6] Tier PER-METRIK TUNGGAL (dipakai untuk mewarnai teks angka
// Download/Upload di tabel secara independen) — threshold SAMA PERSIS dengan
// computeStatus() di atas & computeMetricTier() di server.js.
function computeMetricTier(value) {
  if (value === null || value === undefined || isNaN(value)) return null;
  if (value > 100) return 'Excellent';
  if (value >= 50) return 'Very Good';
  if (value >= 10) return 'Good';
  return 'Poor';
}
const METRIC_TIER_CLASS = {
  'Excellent': 'metric-excellent',
  'Very Good': 'metric-verygood',
  'Good': 'metric-good',
  'Poor': 'metric-poor'
};
// Bungkus angka Mbps (hasil fmtMbpsCell) dalam <span> berwarna sesuai tier metrik itu sendiri.
function fmtMetricCell(v) {
  const text = fmtMbpsCell(v);
  const tier = computeMetricTier(v);
  if (!tier) return `<span class="metric-value">${text}</span>`;
  return `<span class="metric-value ${METRIC_TIER_CLASS[tier]}">${text}</span>`;
}

// [BARU - POIN 8] SISTEM SARAN OTOMATIS TAMU HOTEL — Matriks 4x4 (Download x Upload =
// 16 kondisi), CERMINAN PERSIS dari HOTEL_SUGGESTION_MATRIX di server.js, supaya kartu
// "Saran Otomatis" (lihat #hotelSuggestionBox) bisa dihitung ulang di client kapan pun
// dibutuhkan (mis. dari data laporan tersimpan yang sudah membawa field hotelSuggestion).
const HOTEL_SUGGESTION_MATRIX = [
  { combination: 'Download_Excellent_Upload_Excellent', final_status: 'Excellent', hotel_message: 'Koneksi kelas atas dan sangat seimbang! Anda dapat menikmati streaming 4K, video call, hingga bermain game online tanpa hambatan sama sekali.' },
  { combination: 'Download_Excellent_Upload_Very Good', final_status: 'Very Good', hotel_message: 'Koneksi sangat cepat dan stabil. Sangat nyaman untuk video conference dan streaming film 4K, meskipun upload sedikit di bawah kecepatan unduh.' },
  { combination: 'Download_Excellent_Upload_Good', final_status: 'Good', hotel_message: 'Kecepatan unduh sangat cepat, namun kecepatan unggah berada di level menengah. Streaming film lancar, tetapi mungkin ada sedikit delay saat mengirim file besar. Jika terkendala, cobalah mendekat ke router.' },
  { combination: 'Download_Excellent_Upload_Poor', final_status: 'Poor', hotel_message: 'Kecepatan unduh kencang, tetapi kecepatan unggah sangat lambat. Rapat online atau pengiriman data akan terganggu. Disarankan mendekati router atau hubungi resepsionis.' },
  { combination: 'Download_Very Good_Upload_Excellent', final_status: 'Very Good', hotel_message: 'Koneksi sangat cepat dan sangat stabil. Sangat ideal untuk kerja remote, video call lancar, dan pengiriman file besar tanpa hambatan.' },
  { combination: 'Download_Very Good_Upload_Very Good', final_status: 'Very Good', hotel_message: 'Koneksi cepat dan seimbang di semua jalur. Sangat nyaman untuk aktivitas harian seperti Zoom meeting, streaming HD, hingga game online.' },
  { combination: 'Download_Very Good_Upload_Good', final_status: 'Good', hotel_message: 'Koneksi cukup baik untuk kebutuhan umum. Menonton video berjalan lancar, namun kurangi aktivitas unggah berat agar panggilan video tetap stabil. Coba mendekat ke titik akses Wi-Fi jika jaringan tidak stabil.' },
  { combination: 'Download_Very Good_Upload_Poor', final_status: 'Poor', hotel_message: 'Kecepatan unduh memadai, tetapi unggah sangat rendah. Anda akan mengalami delay berat saat video call atau kirim file. Silakan hubungi resepsionis untuk bantuan jaringan.' },
  { combination: 'Download_Good_Upload_Excellent', final_status: 'Good', hotel_message: 'Pengiriman data sangat cepat, namun kecepatan unduh berada di tingkat standar. Menonton video atau memuat web mungkin butuh waktu jeda sebentar. Dekati router untuk sinyal lebih optimal.' },
  { combination: 'Download_Good_Upload_Very Good', final_status: 'Good', hotel_message: 'Koneksi internet standar dan tetap stabil. Sangat memadai untuk media sosial, browsing, dan panggilan suara. Coba posisikan diri lebih dekat ke router jika ingin streaming lebih lancar.' },
  { combination: 'Download_Good_Upload_Good', final_status: 'Good', hotel_message: 'Koneksi cukup memadai untuk aktivitas harian seperti chatting dan browsing. Kurang ideal untuk gaming kompetitif. Dekati titik akses Wi-Fi jika membutuhkan koneksi yang lebih stabil.' },
  { combination: 'Download_Good_Upload_Poor', final_status: 'Poor', hotel_message: 'Kecepatan unggah yang sangat rendah membuat rapat online dan chatting terasa tersendat. Disarankan untuk mendekati router atau menggunakan paket data seluler.' },
  { combination: 'Download_Poor_Upload_Excellent', final_status: 'Poor', hotel_message: 'Jalur unggah sangat baik, namun kecepatan unduh lambat sehingga video sering buffering. Coba mendekati titik Wi-Fi atau hubungi resepsionis jika masalah berlanjut.' },
  { combination: 'Download_Poor_Upload_Very Good', final_status: 'Poor', hotel_message: 'Aktivitas hiburan seperti streaming dan browsing terganggu karena unduhan lambat. Coba restart Wi-Fi perangkat Anda, mendekat ke router, atau pakai data seluler.' },
  { combination: 'Download_Poor_Upload_Good', final_status: 'Poor', hotel_message: 'Koneksi lambat secara umum. Membuka web atau media sosial akan terasa berat. Silakan mendekat ke router hotel atau hubungi layanan pelanggan hotel.' },
  { combination: 'Download_Poor_Upload_Poor', final_status: 'Poor', hotel_message: 'Koneksi sangat lambat dan kurang memadai. Anda akan mengalami lag dan putus koneksi. Disarankan menghubungi resepsionis hotel atau beralih ke paket data seluler.' }
];
const HOTEL_SUGGESTION_MAP = new Map(HOTEL_SUGGESTION_MATRIX.map((row) => [row.combination, row]));
function getHotelSuggestion(downloadMbps, uploadMbps) {
  const dlTier = computeMetricTier(downloadMbps);
  const ulTier = computeMetricTier(uploadMbps);
  if (!dlTier || !ulTier) return null;
  return HOTEL_SUGGESTION_MAP.get(`Download_${dlTier}_Upload_${ulTier}`) || null;
}

const STATUS_TO_SG_CLASS = {
  'Excellent': 'sg-excellent', 'Very Good': 'sg-verygood', 'Good': 'sg-good', 'Poor': 'sg-poor'
};
const hotelSuggestionBox = document.getElementById('hotelSuggestionBox');
const hsStatus = document.getElementById('hsStatus');
const hsMessage = document.getElementById('hsMessage');
function renderHotelSuggestion(suggestion) {
  if (!suggestion) { hotelSuggestionBox.hidden = true; return; }
  hotelSuggestionBox.hidden = false;
  hotelSuggestionBox.className = `hotel-suggestion ${STATUS_TO_SG_CLASS[suggestion.final_status] || ''}`;
  hsStatus.textContent = suggestion.final_status;
  hsMessage.textContent = suggestion.hotel_message;
}

const filterArea = document.getElementById('filterArea');
function populateFilterAreaOptions() {
  filterArea.innerHTML = '<option value="">— Semua Area —</option>';
  Array.from(selArea.children).forEach((node) => {
    if (node.tagName === 'OPTGROUP') {
      filterArea.appendChild(node.cloneNode(true));
    } else if (node.tagName === 'OPTION' && node.value !== '') {
      filterArea.appendChild(node.cloneNode(true));
    }
  });
}
populateFilterAreaOptions();

const tableSearch = document.getElementById('tableSearch');
let latestReportList = [];

function areaMatchesFilter(areaValue, filterValue) {
  if (!filterValue) return true;
  if (!areaValue) return false;
  if (areaValue === filterValue) return true;
  return areaValue.startsWith(filterValue + ' - Room ');
}

function getFilteredList() {
  const searchTerm = tableSearch.value.trim().toLowerCase();
  const areaFilterValue = filterArea.value;

  return latestReportList.filter((r) => {
    if (!areaMatchesFilter(r.area, areaFilterValue)) return false;
    if (!searchTerm) return true;
    const gwLabels = (r.gateways || []).map((g) => g.label).join(' ');
    const haystack = `${r.time} ${r.area} ${gwLabels}`.toLowerCase();
    return haystack.includes(searchTerm);
  });
}

function escapeAttr(v) {
  return String(v ?? '').replace(/"/g, '&quot;');
}

const GATEWAY_ORDER = ['objective', 'domestik', 'internasional'];

// [POIN 1] Render tabel dengan ROWSPAN 3 — tiap SET data (1 entry) menghasilkan
// 3 <tr>, kolom Time/Area/Download/Upload/Status/Aksi HANYA muncul di <tr> pertama
// dengan rowspan="3", sub-baris ke-2 & ke-3 hanya berisi kolom Gateway s/d Ping.
function renderRows(list) {
  if (!list || !list.length) {
    reportBody.innerHTML = '<tr><td colspan="12" class="empty-row">Belum ada data.</td></tr>';
    return;
  }

  reportBody.innerHTML = list.slice().reverse().map((r) => {
    const status = computeStatus(r.downloadMbps);
    const gateways = Array.isArray(r.gateways) ? r.gateways : [];

    const subRowsHtml = GATEWAY_ORDER.map((key, idx) => {
      const g = gateways.find((x) => x.key === key) || {};
      const gwCells = `
        <td class="col-gateway">${g.label || EMPTY}</td>
        <td class="col-sent">${fmtPacketPercent(g.sent)}</td>
        <td class="col-received">${fmtPacketPercent(g.received)}</td>
        <td class="col-lost">${fmtPacketPercent(g.lost)}</td>
        <td class="col-average">${fmtMsCell(g.avgMs)}</td>
        <td class="col-ping">${fmtPingSingle(g)}</td>`;

      if (idx === 0) {
        // Baris pertama dari set ini: sertakan kolom rowspan="3" (Time/Area/Download/
        // Upload/Status/Aksi) sekaligus.
        return `
        <tr data-row-id="${escapeAttr(r.id)}">
          <td class="col-time" rowspan="3">${r.time}</td>
          <td class="col-area" rowspan="3">${r.area}</td>
          ${gwCells}
          <td class="col-download" rowspan="3">${fmtMetricCell(r.downloadMbps)}</td>
          <td class="col-upload" rowspan="3">${fmtMetricCell(r.uploadMbps)}</td>
          <td class="col-status" rowspan="3"><span class="status-badge ${status.cls}"${r.hotelSuggestion ? ` title="${escapeAttr(r.hotelSuggestion.hotel_message)}"` : ''}>${status.label}</span></td>
          <td rowspan="3" class="col-aksi">
            <button type="button" class="btn-delete-row" data-row-id="${escapeAttr(r.id)}" title="Hapus set data ini" aria-label="Hapus set data ini">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
                <path d="M10 11v6M14 11v6"></path>
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
              </svg>
            </button>
          </td>
        </tr>`;
      }
      // Sub-baris ke-2 & ke-3: hanya kolom Gateway..Ping (kolom rowspan sudah menyatu
      // dari baris pertama, TIDAK diulang di sini).
      return `
        <tr data-row-id="${escapeAttr(r.id)}">
          ${gwCells}
        </tr>`;
    }).join('');

    return subRowsHtml;
  }).join('');
}

// [POIN 5] Hapus SATU SET data (3 sub-baris Gateway) sekaligus — event delegation.
reportBody.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-delete-row');
  if (!btn) return;
  const rowId = btn.dataset.rowId;
  if (!rowId) return;
  const yakin = confirm('Hapus SET data ini (3 sub-baris Gateway) dari laporan? Tindakan ini tidak bisa dibatalkan.');
  if (!yakin) return;

  latestReportList = latestReportList.filter((r) => String(r.id) !== String(rowId));
  renderRows(getFilteredList());
  // Kalau baris yang baru dihapus adalah baris yang sedang dipilih (saran di bawah
  // tabel sedang menampilkan datanya), sembunyikan kotak saran karena datanya sudah tidak ada.
  if (selectedRowId === rowId) {
    selectedRowId = null;
    renderRowSuggestion(null);
  }

  socket.emit('report:delete', { id: rowId });
});

// [POIN 4 - FIX HOVER 3 SUB-BARIS] Karena Time/Area/Download/Upload/Status/Aksi memakai
// rowspan="3" (secara DOM cuma "milik" <tr> PERTAMA dari tiap SET), CSS ":hover" polos pada
// satu <tr> saja TIDAK bisa menyatukan warna latar ke seluruh 3 sub-baris Gateway sekaligus
// (baris yang di-hover ikut gelap, tapi sel rowspan yang secara visual menyatu di situ tetap
// bening -> tampilan "belang"). Solusinya: begitu kursor masuk ke SALAH SATU dari 3 <tr> pada
// satu SET data (dikenali dari data-row-id yang SAMA), tambahkan class ".row-hover" ke
// KETIGA <tr> tersebut sekaligus — CSS lalu mewarnai td dari class ini secara seragam.
function setRowGroupHover(rowId, isHover) {
  if (!rowId) return;
  reportBody.querySelectorAll(`tr[data-row-id="${CSS.escape(String(rowId))}"]`).forEach((tr) => {
    tr.classList.toggle('row-hover', isHover);
  });
}
reportBody.addEventListener('mouseover', (e) => {
  const tr = e.target.closest('tr[data-row-id]');
  if (!tr) return;
  setRowGroupHover(tr.dataset.rowId, true);
});
reportBody.addEventListener('mouseout', (e) => {
  const tr = e.target.closest('tr[data-row-id]');
  if (!tr) return;
  // Kalau kursor cuma pindah ke <tr> LAIN dalam SET yang sama (data-row-id sama), JANGAN
  // matikan highlight-nya — supaya tidak "berkedip" saat kursor bergerak antar sub-baris.
  const to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest('tr[data-row-id]') : null;
  if (to && to.dataset.rowId === tr.dataset.rowId) return;
  setRowGroupHover(tr.dataset.rowId, false);
});

function renderReport(list) {
  latestReportList = list || [];
  renderRows(getFilteredList());
}

// ============================================================
// [BARU - POIN 3] SARAN OTOMATIS DI BAWAH TABEL — diperbarui dinamis saat salah satu
// baris data pada tabel diklik, menyesuaikan kategori Status (Excellent/Very Good/Good/
// Poor) dari baris tersebut. Pesan per kategori HANYA berdasarkan Download (Avg), sesuai
// kriteria evaluasi baru — terpisah dari kotak "Saran Otomatis Tamu" di panel Pengujian
// (yang tetap memakai kombinasi Download+Upload, tidak diubah oleh fitur ini).
// ============================================================
const CATEGORY_ROW_SUGGESTION = {
  'Excellent': 'Kecepatan unduh (Download Avg) kelas atas — di atas 100 Mbps. Sangat ideal untuk streaming 4K, video call, unduhan besar, hingga kebutuhan multi-perangkat sekaligus tanpa hambatan.',
  'Very Good': 'Kecepatan unduh (Download Avg) cepat & stabil — 50 sampai 100 Mbps. Nyaman untuk streaming HD/4K, video call, dan gaming online.',
  'Good': 'Kecepatan unduh (Download Avg) standar — 10 sampai 50 Mbps. Cukup untuk browsing, media sosial, dan streaming kualitas standar; mungkin sedikit lag pada aktivitas berat.',
  'Poor': 'Kecepatan unduh (Download Avg) rendah — di bawah 10 Mbps. Berpotensi buffering dan lag saat streaming, video call, atau bermain game online. Coba mendekat ke titik akses Wi-Fi atau hubungi resepsionis.',
  'Tidak Ada Data': 'Data kecepatan unduh (Download Avg) untuk baris ini tidak tersedia (Speedtest gagal saat pengujian dilakukan).'
};
const STATUS_TO_ROW_SG_CLASS = {
  'Excellent': 'sg-excellent', 'Very Good': 'sg-verygood', 'Good': 'sg-good', 'Poor': 'sg-poor', 'Tidak Ada Data': ''
};
const rowSuggestionBox = document.getElementById('rowSuggestionBox');
const rsStatus = document.getElementById('rsStatus');
const rsMessage = document.getElementById('rsMessage');

function renderRowSuggestion(entry) {
  if (!entry) { rowSuggestionBox.hidden = true; return; }
  const status = entry.status || computeStatus(entry.downloadMbps).label;
  rowSuggestionBox.hidden = false;
  rowSuggestionBox.className = `hotel-suggestion ${STATUS_TO_ROW_SG_CLASS[status] || ''}`;
  rsStatus.textContent = status;
  rsMessage.textContent = CATEGORY_ROW_SUGGESTION[status] || '–';
}

// Tandai baris (1 SET data / 3 sub-baris Gateway) yang sedang dipilih, supaya jelas
// saran di bawah tabel itu untuk baris yang mana.
let selectedRowId = null;
function setRowGroupSelected(rowId) {
  if (selectedRowId) {
    reportBody.querySelectorAll(`tr[data-row-id="${CSS.escape(String(selectedRowId))}"]`)
      .forEach((tr) => tr.classList.remove('row-selected'));
  }
  selectedRowId = rowId;
  if (rowId) {
    reportBody.querySelectorAll(`tr[data-row-id="${CSS.escape(String(rowId))}"]`)
      .forEach((tr) => tr.classList.add('row-selected'));
  }
}

// Event delegation: klik baris manapun (SELAIN tombol hapus, yang sudah ditangani
// listener terpisah di atas) -> perbarui kotak saran di bawah tabel.
reportBody.addEventListener('click', (e) => {
  if (e.target.closest('.btn-delete-row')) return;
  const tr = e.target.closest('tr[data-row-id]');
  if (!tr) return;
  const rowId = tr.dataset.rowId;
  const entry = latestReportList.find((r) => String(r.id) === String(rowId));
  if (!entry) return;
  setRowGroupSelected(rowId);
  renderRowSuggestion(entry);
});

tableSearch.addEventListener('input', () => renderRows(getFilteredList()));
filterArea.addEventListener('change', () => renderRows(getFilteredList()));

fetch('/api/report/list').then((r) => r.json()).then(renderReport);
socket.on('report:updated', renderReport);
socket.on('report:save:error', ({ message }) => alert('Gagal menyimpan laporan: ' + message));

const btnResetLaporan = document.getElementById('btnResetLaporan');
btnResetLaporan.addEventListener('click', () => {
  const yakin = confirm('Yakin ingin menghapus SELURUH riwayat laporan? Tindakan ini tidak bisa dibatalkan.');
  if (!yakin) return;
  socket.emit('report:reset');
  renderReport([]);
  selectedRowId = null;
  renderRowSuggestion(null);
});

/* ============================================================
 * OFFLINE BANNER
 * ============================================================ */
const offlineBanner = document.getElementById('offlineBanner');
function updateOnlineStatus() { offlineBanner.hidden = navigator.onLine; }
window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);
updateOnlineStatus();
