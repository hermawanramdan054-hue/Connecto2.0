/**
 * server.js  (v8.2.1 — Produksi Final Mutlak & Anti-Anomali Fixed)
 * ------------------------------------------------------------
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');
const ping = require('ping');
const PDFDocument = require('pdfkit');
const tls = require('tls');
const net = require('net');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
const PORT = Number(process.env.PORT) || 3000;
const MAX_PORT_TRIES = 20;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.get('/app-icon', (req, res) => res.sendFile(path.join(__dirname, 'icon.ico')));

// ============================================================
// SUMBER DATA UTAMA — /data/reports.json
// ============================================================
const isPackaged = !process.defaultApp && (process.resourcesPath && !process.resourcesPath.includes('node_modules'));
const DATA_DIR = process.env.CONNECTO_DATA_DIR
  ? path.resolve(process.env.CONNECTO_DATA_DIR)
  : (isPackaged ? path.join(path.dirname(process.execPath), 'data') : path.join(__dirname, 'data'));
const JSON_PATH = path.join(DATA_DIR, 'reports.json');

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(JSON_PATH)) fs.writeFileSync(JSON_PATH, '[]', 'utf-8');
}
ensureDataFiles();

function readReportList() {
  ensureDataFiles();
  return JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
}

function generateRowId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function saveReportRow(entry) {
  const list = readReportList();
  if (!entry.id) entry.id = generateRowId();
  list.push(entry);
  fs.writeFileSync(JSON_PATH, JSON.stringify(list, null, 2), 'utf-8');
  return list;
}

function deleteReportRow(id) {
  const list = readReportList();
  const next = list.filter((r) => String(r.id) !== String(id));
  fs.writeFileSync(JSON_PATH, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

// ============================================================
// LOGIKA STATUS KELAYAKAN — 4 KATEGORI (Hanya berdasar Download Avg)
// ============================================================
function computeStatusLabel(downloadMbps) {
  if (downloadMbps === null || downloadMbps === undefined || isNaN(downloadMbps)) {
    return 'Tidak Ada Data';
  }
  if (downloadMbps > 100) return 'Excellent';
  if (downloadMbps >= 50) return 'Very Good';
  if (downloadMbps >= 10) return 'Good';
  return 'Poor';
}

function computeMetricTier(value) {
  if (value === null || value === undefined || isNaN(value)) return null;
  if (value > 100) return 'Excellent';
  if (value >= 50) return 'Very Good';
  if (value >= 10) return 'Good';
  return 'Poor';
}

// ============================================================
// SISTEM SARAN OTOMATIS TAMU HOTEL — Matriks 4x4
// ============================================================
const HOTEL_SUGGESTION_MATRIX = [
  { combination: 'Download_Excellent_Upload_Excellent', final_status: 'Excellent', hotel_message: 'Koneksi kelas atas dan sangat seimbang! Anda dapat menikmati streaming 4K, video call, hingga bermain game online tanpa hambatan sama sekali.' },
  { combination: 'Download_Excellent_Upload_Very Good', final_status: 'Very Good', hotel_message: 'Koneksi sangat cepat dan stabil. Sangat nyaman untuk video conference dan streaming film 4K, meskipun upload sedikit di bawah kecepatan unduh.' },
  { combination: 'Download_Excellent_Upload_Good', final_status: 'Good', hotel_message: 'Kecepatan unduh sangat cepat, namun kecepatan unggah berada di level menengah. Streaming film lancar, tetapi mungkin ada sedikit delay saat mengirim file besar.' },
  { combination: 'Download_Excellent_Upload_Poor', final_status: 'Poor', hotel_message: 'Kecepatan unduh kencang, tetapi kecepatan unggah sangat lambat. Rapat online atau pengiriman data akan terganggu.' },
  { combination: 'Download_Very Good_Upload_Excellent', final_status: 'Very Good', hotel_message: 'Koneksi sangat cepat dan sangat stabil. Sangat ideal untuk kerja remote, video call lancar, dan pengiriman file besar tanpa hambatan.' },
  { combination: 'Download_Very Good_Upload_Very Good', final_status: 'Very Good', hotel_message: 'Koneksi cepat dan seimbang di semua jalur. Sangat nyaman untuk aktivitas harian.' },
  { combination: 'Download_Very Good_Upload_Good', final_status: 'Good', hotel_message: 'Koneksi cukup baik untuk kebutuhan umum. Menonton video berjalan lancar, namun kurangi aktivitas unggah berat.' },
  { combination: 'Download_Very Good_Upload_Poor', final_status: 'Poor', hotel_message: 'Kecepatan unduh memadai, tetapi unggah sangat rendah. Anda akan mengalami delay berat saat video call.' },
  { combination: 'Download_Good_Upload_Excellent', final_status: 'Good', hotel_message: 'Pengiriman data sangat cepat, namun kecepatan unduh berada di tingkat standar.' },
  { combination: 'Download_Good_Upload_Very Good', final_status: 'Good', hotel_message: 'Koneksi internet standar dan tetap stabil. Sangat memadai untuk media sosial dan browsing.' },
  { combination: 'Download_Good_Upload_Good', final_status: 'Good', hotel_message: 'Koneksi cukup memadai untuk aktivitas harian seperti chatting dan browsing.' },
  { combination: 'Download_Good_Upload_Poor', final_status: 'Poor', hotel_message: 'Kecepatan unggah yang sangat rendah membuat rapat online and chatting terasa tersendat.' },
  { combination: 'Download_Poor_Upload_Excellent', final_status: 'Poor', hotel_message: 'Jalur unggah sangat baik, namun kecepatan unduh lambat sehingga video sering buffering.' },
  { combination: 'Download_Poor_Upload_Very Good', final_status: 'Poor', hotel_message: 'Aktivitas hiburan seperti streaming dan browsing terganggu karena unduhan lambat.' },
  { combination: 'Download_Poor_Upload_Good', final_status: 'Poor', hotel_message: 'Koneksi lambat secara umum. Membuka web atau media sosial akan terasa berat.' },
  { combination: 'Download_Poor_Upload_Poor', final_status: 'Poor', hotel_message: 'Koneksi sangat lambat dan kurang memadai. Disarankan menghubungi resepsionis hotel.' }
];

const HOTEL_SUGGESTION_MAP = new Map(HOTEL_SUGGESTION_MATRIX.map((row) => [row.combination, row]));

function getHotelSuggestion(downloadMbps, uploadMbps) {
  const dlTier = computeMetricTier(downloadMbps);
  const ulTier = computeMetricTier(uploadMbps);
  if (!dlTier || !ulTier) return null;
  const key = `Download_${dlTier}_Upload_${ulTier}`;
  return HOTEL_SUGGESTION_MAP.get(key) || null;
}

const GATEWAY_ORDER = ['objective', 'domestik', 'internasional'];
const DEFAULT_PING_COUNT = 3;
const DEFAULT_SPEEDTEST_RUNS = 1;
const SPEEDTEST_RETRIES = 1;

app.get('/api/report/download/pdf', (req, res) => {
  let reports;
  try {
    reports = readReportList();
  } catch (err) {
    return res.status(500).send('Data laporan tidak dapat dibaca.');
  }
  if (!reports.length) return res.status(404).send('Belum ada data laporan untuk diunduh.');

  const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/T/, '-').slice(0, 15);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="Connecto-Laporan-${timestamp}.pdf"`);

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 32, right: 28, bottom: 32, left: 28 } });
  doc.pipe(res);

  const columns = [
    { title: 'Time', width: 82, align: 'left' },
    { title: 'Area', width: 94, align: 'left' },
    { title: 'Gateway', width: 112, align: 'left' },
    { title: 'Sent (%)', width: 48, align: 'center' },
    { title: 'Received (%)', width: 58, align: 'center' },
    { title: 'Lost (%)', width: 48, align: 'center' },
    { title: 'Average', width: 65, align: 'right' },
    { title: 'Ping', width: 58, align: 'right' },
    { title: 'Download (Mbps)', width: 76, align: 'right' },
    { title: 'Upload (Mbps)', width: 76, align: 'right' },
    { title: 'Status', width: 64, align: 'center' }
  ];
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);
  const tableX = (doc.page.width - tableWidth) / 2;
  const rowHeight = 20;
  const pageBottom = doc.page.height - 32;

  function drawTableHeader() {
    let x = tableX;
    const y = doc.y;
    doc.font('Helvetica-Bold').fontSize(7).fillColor('#ffffff');
    columns.forEach((column) => {
      doc.rect(x, y, column.width, rowHeight).fillAndStroke('#243247', '#52647a');
      doc.fillColor('#ffffff').text(column.title, x + 3, y + 6, {
        width: column.width - 6, height: rowHeight - 8, align: column.align, lineBreak: false
      });
      x += column.width;
    });
    doc.y = y + rowHeight;
  }

  function drawCell(text, x, y, column, fillColor) {
    doc.rect(x, y, column.width, rowHeight).fillAndStroke(fillColor, '#c6cfda');
    doc.font('Helvetica').fontSize(7).fillColor('#111827').text(String(text ?? '–'), x + 3, y + 6, {
      width: column.width - 6, height: rowHeight - 8, align: column.align,
      lineBreak: false, ellipsis: true
    });
  }

  function formatNumber(value, digits = 1) {
    return value === null || value === undefined || !Number.isFinite(Number(value)) ? '–' : Number(value).toFixed(digits);
  }

  function formatPacketPercent(value) {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '–';
    const numericValue = Number(value);
    const denominator = numericValue <= 3 ? 3 : 100;
    return `${Math.round((numericValue / denominator) * 100)}%`;
  }

  doc.font('Helvetica-Bold').fontSize(17).fillColor('#111827').text('Laporan Riwayat Pengujian Jaringan', { align: 'center' });
  doc.moveDown(0.25);
  doc.font('Helvetica').fontSize(8).fillColor('#526174')
    .text(`Dibuat: ${new Date().toLocaleString('id-ID')}    |    Total pengujian: ${reports.length}`, { align: 'center' });
  doc.moveDown(1.1);
  drawTableHeader();

  reports.slice().reverse().forEach((report) => {
    const gateways = Array.isArray(report.gateways) ? report.gateways : [];
    const status = report.status || computeStatusLabel(report.downloadMbps);
    const orderedGateways = GATEWAY_ORDER.map((key) => gateways.find((gateway) => gateway.key === key) || {});

    orderedGateways.forEach((gateway, index) => {
      if (doc.y + rowHeight > pageBottom) {
        doc.addPage({ size: 'A4', layout: 'landscape', margins: { top: 32, right: 28, bottom: 32, left: 28 } });
        doc.font('Helvetica-Bold').fontSize(10).fillColor('#111827').text('Laporan Riwayat Pengujian Jaringan (lanjutan)', { align: 'center' });
        doc.moveDown(0.6);
        drawTableHeader();
      }

      const y = doc.y;
      const fillColor = index % 2 === 0 ? '#ffffff' : '#f3f6fa';
      const gatewayLabel = gateway.label || '–';
      const values = index === 0
        ? [report.time, report.area, gatewayLabel, formatPacketPercent(gateway.sent), formatPacketPercent(gateway.received), formatPacketPercent(gateway.lost), formatNumber(gateway.avgMs), formatNumber(gateway.lastMs), formatNumber(report.downloadMbps, 2), formatNumber(report.uploadMbps, 2), status]
        : ['', '', gatewayLabel, formatPacketPercent(gateway.sent), formatPacketPercent(gateway.received), formatPacketPercent(gateway.lost), formatNumber(gateway.avgMs), formatNumber(gateway.lastMs), '', '', ''];

      let x = tableX;
      values.forEach((value, columnIndex) => {
        drawCell(value, x, y, columns[columnIndex], fillColor);
        x += columns[columnIndex].width;
      });
      doc.y = y + rowHeight;
    });
  });

  doc.end();
});

app.get('/api/report/list', (req, res) => {
  res.json(readReportList());
});

app.post('/api/report/reset', (req, res) => {
  fs.writeFileSync(JSON_PATH, '[]', 'utf-8');
  io.emit('report:updated', []);
  res.json({ ok: true });
});

// ============================================================// DAFTAR TARGET PING & AREA GATEWAY// ============================================================
const PING_TARGETS = {
  domestik: [
    { label: 'KOMPAS.COM', ip: 'kompas.com' },
    { label: 'TOKOPEDIA.COM', ip: 'tokopedia.com' },
    { label: 'DETIK.COM', ip: 'detik.com' }
  ],
  internasional: [
    { label: 'GOOGLE.COM', ip: 'google.com' },
    { label: 'CLOUDFLARE.COM', ip: 'cloudflare.com' }
  ]
};

app.get('/api/ping-targets', (req, res) => res.json(PING_TARGETS));

function detectDefaultGateway() {
  return new Promise((resolve) => {
    const command = process.platform === 'win32' ? 'route' : 'ip';
    const args = process.platform === 'win32' ? ['print', '0.0.0.0'] : ['route', 'show', 'default'];
    execFile(command, args, { windowsHide: true, timeout: 5000 }, (error, stdout) => {
      if (error) return resolve(null);
      const output = String(stdout || '');
      const match = process.platform === 'win32'
        ? output.match(/^\s*0\.0\.0\.0\s+0\.0\.0\.0\s+([0-9.]+)\s+/m)
        : output.match(/default via\s+([^\s]+)/i);
      resolve(match ? match[1] : null);
    });
  });
}

app.get('/api/local-gateway', async (req, res) => {
  const gateway = await detectDefaultGateway();
  res.json({ gateway, source: gateway ? 'active-default-route' : null });
});

const AREA_GATEWAY_MAP = {
  'AMBASADOR LOUNGE': '192.168.200.1',
  'LOBBY': '192.168.200.1',
  'MIRTEN LOUNGE': '192.168.200.1',
  'CANTIGI LOUNGE': '192.168.212.1',
  'POOL': '192.168.200.1',
  'GARDEN': '192.168.200.1',
  'PAGO RESTAURANT': '192.168.200.1',
  'HB GRILL': '192.168.200.1',
  'MASJID': '10.10.20.1',
  '1ST FLOOR WING A': '192.168.200.1',
  '1ST FLOOR WING B': '192.168.200.1',
  '2ND FLOOR WING A': '192.168.200.1',
  '2ND FLOOR WING B': '192.168.200.1',
  '3RD FLOOR WING A': '192.168.200.1',
  '3RD FLOOR WING B': '192.168.200.1',
  '4TH FLOOR WING A': '192.168.200.1',
  '4TH FLOOR WING B': '192.168.200.1',
  '5TH FLOOR WING A': '192.168.200.1',
  '5TH FLOOR WING B': '192.168.200.1',
  'CIMANUK': '10.255.254.1',
  'CISANGGARUNG': '10.255.254.1',
  'CITARIK': '192.168.212.1',
  'CITANDUY': '192.168.212.1',
  'SUAGI 1': '192.168.212.1',
  'SUAGI 2': '192.168.212.1',
  'PAPANDAYAN 1': '192.168.204.1',
  'PAPANDAYAN 2': '192.168.204.1',
  'PAPANDAYAN 3': '192.168.204.1',
  'PAPANDAYAN 4': '192.168.204.1',
  'PAPANDAYAN 5': '192.168.204.1',
  'PAPANDAYAN 6': '192.168.204.1'
};

function getBaseAreaKey(area) {
  if (!area) return area;
  const marker = ' - Room ';
  const idx = area.indexOf(marker);
  return idx !== -1 ? area.slice(0, idx) : area;
}

function getGatewayForArea(area, fallbackGateway) {
  const baseArea = getBaseAreaKey(area);
  const mapped = AREA_GATEWAY_MAP[baseArea];
  if (mapped) return mapped;
  if (fallbackGateway && String(fallbackGateway).trim()) return fallbackGateway;
  return '–';
}

function bandwidthToMbps(bytesPerSec) {
  if (!bytesPerSec && bytesPerSec !== 0) return null;
  return (bytesPerSec * 8) / 1_000_000;
}

// ============================================================
// SPEEDTEST — Ookla CLI Pure Hybrid Engine
// ============================================================
function runOoklaSpeedtest(onProgress, onProc) {
  return new Promise((resolve, reject) => {
    const isPackaged = !process.defaultApp && (process.resourcesPath && !process.resourcesPath.includes('node_modules'));
    const speedtestPath = isPackaged
      ? path.join(process.resourcesPath, 'bin', 'speedtest.exe')
      : path.join(__dirname, 'bin', 'speedtest.exe');
    let proc;
    try {
      proc = spawn(speedtestPath, ['--accept-license', '--accept-gdpr', '-f', 'json']);
      if (onProc) onProc(proc);
    } catch (spawnErr) {
      return reject(new Error('SPEEDTEST_CLI_NOT_FOUND: Gagal eksekusi biner. ' + spawnErr.message));
    }
    let buffer = '';
    let finalResult = null;
    let stderrText = '';
    let spawnFailed = false;
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      try { proc.kill(); } catch (e) {}
      finishReject(new Error('Speedtest timeout setelah 45 detik. Periksa koneksi internet atau firewall.'));
    }, 45000);

    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(value);
    };
    const finishReject = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    };

    const parseOutputLine = (line) => {
      const cleanLine = line.trim();
      if (!cleanLine) return;

      try {
        const data = JSON.parse(cleanLine);
        if (data.type === 'download' && data.download && !finalResult?.downloadMbps) {
          const dlMbps = Number(((data.download.bandwidth * 8) / 1000000).toFixed(2));
          if (onProgress) onProgress({ type: 'download', progress: dlMbps });
          if (!finalResult) finalResult = { type: 'result' };
          finalResult.download = data.download;
          finalResult.downloadMbps = dlMbps;
        }
        if (data.type === 'upload' && data.upload && !finalResult?.uploadMbps) {
          const ulMbps = Number(((data.upload.bandwidth * 8) / 1000000).toFixed(2));
          if (onProgress) onProgress({ type: 'upload', progress: ulMbps });
          if (!finalResult) finalResult = { type: 'result' };
          finalResult.upload = data.upload;
          finalResult.uploadMbps = ulMbps;
        }
        if (data.type === 'result' && data.download && data.upload) {
          finalResult = data;
          finalResult.downloadMbps = Number(((data.download.bandwidth * 8) / 1000000).toFixed(2));
          finalResult.uploadMbps = Number(((data.upload.bandwidth * 8) / 1000000).toFixed(2));
        }
        return;
      } catch (jsonErr) {
        const downloadMatch = cleanLine.match(/Download:\s+([0-9.]+)\s+Mbps/i);
        const uploadMatch = cleanLine.match(/Upload:\s+([0-9.]+)\s+Mbps/i);
        if (downloadMatch) {
          const downloadMbps = Number(downloadMatch[1]);
          if (onProgress) onProgress({ type: 'download', progress: downloadMbps });
          finalResult = { ...(finalResult || { type: 'result' }), downloadMbps };
        }
        if (uploadMatch) {
          const uploadMbps = Number(uploadMatch[1]);
          if (onProgress) onProgress({ type: 'upload', progress: uploadMbps });
          finalResult = { ...(finalResult || { type: 'result' }), uploadMbps };
        }
      }
    };


    proc.stdout.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) parseOutputLine(line);
    });

proc.stderr.on('data', (chunk) => {
      stderrText += chunk.toString();
    });

    proc.on('error', (err) => {
      spawnFailed = true;
      let errorReason = 'Diblokir Antivirus / Tidak Ada Hak Akses (Administrator)';
      if (err.code === 'ENOENT') {
        errorReason = 'File speedtest.exe tidak ditemukan di dalam folder resources';
      }
      finishReject(new Error(errorReason));
    });

    proc.on('close', (code, signal) => {
      if (spawnFailed || settled) return;
      if (buffer.trim()) parseOutputLine(buffer);
      const wasKilled = proc.killed || signal === 'SIGTERM' || signal === 'SIGKILL';
      if (wasKilled && !finalResult) {
        return finishReject(new Error(
          'Proses speedtest dihentikan sebelum menghasilkan data.'
        ));
      }

      const hasValidDownload = Number.isFinite(finalResult?.downloadMbps);
      const hasValidUpload = Number.isFinite(finalResult?.uploadMbps);
      const hasCompleteMetrics = hasValidDownload && hasValidUpload;

      if (finalResult && hasCompleteMetrics) {
        finalResult.success = true;
        return finishResolve(finalResult);
      }

      finishReject(new Error(
        stderrText.trim() || `Speedtest selesai tanpa hasil (kode proses ${code ?? 'tidak diketahui'}).`
      ));
    });
  });
}

function runPythonSpeedtestFallback(onProc) {
  return new Promise((resolve, reject) => {
    const pythonCommand = process.platform === 'win32' ? 'python' : 'python3';
    const scriptPath = path.join(__dirname, 'scripts', 'speedtest_fallback.py');
    const proc = spawn(pythonCommand, [scriptPath], { windowsHide: true });
    if (onProc) onProc(proc);
    let output = '';
    let errorOutput = '';
    const timeout = setTimeout(() => {
      try { proc.kill(); } catch (e) {}
      reject(new Error('Fallback Python speedtest timeout setelah 45 detik.'));
    }, 45000);

    proc.stdout.on('data', (chunk) => { output += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { errorOutput += chunk.toString(); });
    proc.on('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Fallback Python tidak tersedia: ${err.message}`));
    });
    proc.on('close', (code) => {
      clearTimeout(timeout);
      try {
        const result = JSON.parse(output.trim().split(/\r?\n/).pop() || '{}');
        if (result.error) throw new Error(result.error);
        if (!Number.isFinite(result.downloadMbps) || !Number.isFinite(result.uploadMbps)) {
          throw new Error('Fallback Python tidak menghasilkan download/upload.');
        }
        resolve(result);
      } catch (err) {
        reject(new Error(errorOutput.trim() || err.message || `Fallback gagal dengan kode ${code}.`));
      }
    });
  });
}

async function runSpeedtestWithFallback(onProgress, testState) {
  const registerProc = (proc) => { if (testState) testState.speedtestProc = proc; };
  let lastError = null;

  for (let attempt = 0; attempt <= SPEEDTEST_RETRIES; attempt++) {
    if (testState?.cancelled) throw new Error('CANCELLED');
    try {
      await new Promise(resolve => setTimeout(resolve, attempt ? 1000 : 2500));
      if (testState?.cancelled) throw new Error('CANCELLED');
      const result = await runOoklaSpeedtest(onProgress, registerProc);
      return {
        downloadMbps: result.downloadMbps,
        uploadMbps: result.uploadMbps,
        pingMs: result.ping?.latency ?? null,
        source: attempt ? 'ookla-cli-retry' : 'ookla-cli'
      };
    } catch (err) {
      if (testState?.cancelled || err.message === 'CANCELLED') throw new Error('CANCELLED');
      lastError = err;
    } finally {
      if (testState) testState.speedtestProc = null;
    }
  }

  if (testState?.cancelled) throw new Error('CANCELLED');
  try {
    const fb = await runPythonSpeedtestFallback(registerProc);
    return {
      downloadMbps: fb.downloadMbps,
      uploadMbps: fb.uploadMbps,
      pingMs: fb.pingMs ?? null,
      source: 'python-fallback'
    };
  } catch (fallbackError) {
    throw new Error(`${lastError?.message || 'Ookla gagal.'} Fallback: ${fallbackError.message}`);
  } finally {
    if (testState) testState.speedtestProc = null;
  }
}

// ============================================================
// PING STAGE & SUMMARY
// ============================================================
function probeTls(target, testState, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    let settled = false;
    let probeSocket;
    const timeout = setTimeout(() => finish(false), timeoutMs);

    function finish(alive) {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (testState.activeProbeSocket === probeSocket) testState.activeProbeSocket = null;
      if (probeSocket && !probeSocket.destroyed) probeSocket.destroy();
      resolve({ alive, time: alive ? Date.now() - startedAt : 'unknown' });
    }

    try {
      const options = { host: target, port: 443, timeout: timeoutMs };
      if (!net.isIP(target)) options.servername = target;
      probeSocket = tls.connect(options);
      testState.activeProbeSocket = probeSocket;
      probeSocket.once('secureConnect', () => finish(true));
      probeSocket.once('error', () => finish(false));
      probeSocket.once('timeout', () => finish(false));
      probeSocket.once('close', () => finish(false));
    } catch (err) {
      finish(false);
    }
  });
}

function runPingStage({ socket, testState, stopFlags, target, label, allowTlsFallback = false, stageIndex, totalStages, count = DEFAULT_PING_COUNT }) {
  return new Promise(async (resolve) => {
    const jobId = `${target}:${Date.now()}:${Math.random().toString(36).slice(2, 6)}`;
    testState.pingJobId = jobId;
    const times = [];
    let sent = 0;
    let received = 0;

    for (let seq = 1; seq <= count; seq++) {
      if (testState.cancelled || stopFlags.has(jobId) || socket.disconnected) break;
      sent++;
      let res;
      try {
        res = await ping.promise.probe(target, {
          timeout: 2,
          extra: os.platform() === 'linux' ? ['-c', '1'] : []
        });
      } catch (err) {
        res = { alive: false, time: 'unknown' };
      }
      const alive = !!res.alive;
      const timeMs = typeof res.time === 'number' ? res.time : null;
      if (alive && timeMs !== null) {
        received++;
        times.push(timeMs);
        if (testState.combinedTimes) testState.combinedTimes.push(timeMs);
      }
      socket.emit('test:ping-progress', { stageIndex, totalStages, label, seq, total: count });
    }

    let resultMethod = 'icmp';
    if (allowTlsFallback && received === 0 && !testState.cancelled && !socket.disconnected) {
      resultMethod = 'tls-fallback';
      sent = 0;
      received = 0;
      times.length = 0;

      for (let seq = 1; seq <= count; seq++) {
        if (testState.cancelled || socket.disconnected) break;
        sent++;
        const res = await probeTls(target, testState);
        if (res.alive && typeof res.time === 'number') {
          received++;
          times.push(res.time);
        }
        socket.emit('test:ping-progress', { stageIndex, totalStages, label, seq, total: count });
      }
    }

    stopFlags.delete(jobId);
    testState.pingJobId = null;

    const avgMs = times.length ? Number((times.reduce((a, b) => a + b, 0) / times.length).toFixed(2)) : null;
    const minMs = times.length ? Number(Math.min(...times).toFixed(2)) : null;
    const maxMs = times.length ? Number(Math.max(...times).toFixed(2)) : null;
    const lastMs = times.length ? Number(times[times.length - 1].toFixed(2)) : null;
    const lost = sent - received;

    resolve({ sent, received, lost, avgMs, minMs, maxMs, lastMs, method: resultMethod, cancelledMidway: testState.cancelled });
  });
}

function calcJitterFromTimes(times) {
  if (!Array.isArray(times) || times.length < 2) return null;
  let totalDiff = 0;
  for (let i = 1; i < times.length; i++) totalDiff += Math.abs(times[i] - times[i - 1]);
  return Number((totalDiff / (times.length - 1)).toFixed(2));
}

function computePingSummary(times) {
  if (!Array.isArray(times) || !times.length) {
    return { avgMs: null, jitterMs: null, minMs: null, maxMs: null };
  }
  return {
    avgMs: Number((times.reduce((a, b) => a + b, 0) / times.length).toFixed(2)),
    jitterMs: calcJitterFromTimes(times),
    minMs: Number(Math.min(...times).toFixed(2)),
    maxMs: Number(Math.max(...times).toFixed(2))
  };
}

function buildTestDiagnosis({ gatewayResults, speedtestFailed, speedtestError, downloadMbps, uploadMbps }) {
  const failedGateways = gatewayResults.filter((gateway) => gateway.received === 0);
  const partialGateways = gatewayResults.filter((gateway) => gateway.received > 0 && gateway.lost > 0);
  const failedObjective = failedGateways.some((gateway) => gateway.key === 'objective');
  const failedExternalTargets = failedGateways.filter((gateway) => gateway.key !== 'objective');

  if (speedtestFailed) {
    return {
      status: 'Speedtest Gagal',
      reason: speedtestError || 'Speedtest tidak mengembalikan data download/upload.',
      action: 'Periksa internet, captive portal hotel, firewall, antivirus, atau izin menjalankan speedtest.exe.'
    };
  }
  if (failedExternalTargets.length) {
    const failedFallbackTargets = failedExternalTargets.filter((gateway) => gateway.method === 'tls-fallback');
    const failedIcmpTargets = failedExternalTargets.filter((gateway) => gateway.method !== 'tls-fallback');
    const reasons = [];
    if (failedFallbackTargets.length) reasons.push(`Tidak ada respons dari target: ${failedFallbackTargets.map((gateway) => gateway.label).join(', ')}.`);
    if (failedIcmpTargets.length) reasons.push(`Target tidak membalas: ${failedIcmpTargets.map((gateway) => gateway.label).join(', ')}.`);
    return {
      status: 'Target Tidak Terjangkau',
      reason: `${reasons.join(' ')} Gunakan hasil speedtest untuk membedakan masalah target dari internet terputus.`,
      action: 'Periksa koneksi internet, DNS, firewall, atau pembatasan akses ke target tersebut.'
    };
  }
  if (failedObjective) {
    return {
      status: 'Gateway Tidak Membalas Ping',
      reason: 'Gateway area tidak membalas. Beberapa router membatasi balasan ping meskipun koneksi tetap berfungsi.',
      action: 'Bandingkan dengan ping target luar dan speedtest. Periksa gateway atau access point hanya jika metrik lain juga gagal.'
    };
  }
  if (partialGateways.length) {
    return {
      status: 'Ping Tidak Stabil',
      reason: `Ada percobaan yang tidak mendapat balasan dari: ${partialGateways.map((gateway) => gateway.label).join(', ')}. Hanya tiga sampel diuji, jadi kondisi sesaat dapat memengaruhi hasil.`,
      action: 'Ulangi pengujian dan bandingkan dengan speedtest sebelum menyimpulkan jaringan tidak stabil.'
    };
  }
  if (downloadMbps < 10 || uploadMbps < 3) {
    return {
      status: 'Koneksi Lambat',
      reason: `Download ${downloadMbps ?? '–'} Mbps dan upload ${uploadMbps ?? '–'} Mbps berada di bawah batas nyaman.`,
      action: 'Dekatkan perangkat ke access point atau periksa kapasitas koneksi area.'
    };
  }
  return {
    status: 'Pengujian Berhasil',
    reason: 'Pengujian gateway, target pilihan, dan speedtest berhasil mengembalikan data.',
    action: 'Tidak ada tindakan khusus. Hasil dapat digunakan sebagai kondisi jaringan saat ini.'
  };
}

// ============================================================
// SOCKET.IO HANDLER
// ============================================================
io.on('connection', (socket) => {
  const stopFlags = new Set();
  let testState = { cancelled: false, pingJobId: null, speedtestProc: null, activeProbeSocket: null };
  let testRunning = false;

  socket.on('test:start', async (payload = {}) => {
    if (testRunning) {
      return socket.emit('test:error', { message: 'Pengujian sedang berjalan. Tunggu selesai atau tekan Stop.' });
    }
    const {
      area,
      isCustomArea,
      objectiveTarget,
      domestikTarget,
      domestikLabel,
      internasionalTarget,
      internasionalLabel
    } = payload;

    if (!area) return socket.emit('test:error', { message: 'Area tidak valid.' });
    if (!domestikTarget) return socket.emit('test:error', { message: 'Target Ping Domestik tidak valid.' });
    if (!internasionalTarget) return socket.emit('test:error', { message: 'Target Ping Internasional tidak valid.' });

    testState = { cancelled: false, pingJobId: null, speedtestProc: null, activeProbeSocket: null, combinedTimes: [] };
    testRunning = true;

    const resolvedObjectiveTarget = isCustomArea
      ? (objectiveTarget || '').trim()
      : getGatewayForArea(area, objectiveTarget);

    if (!resolvedObjectiveTarget || resolvedObjectiveTarget === '–') {
      return socket.emit('test:error', { message: 'Gateway/Target Objective tidak ditemukan untuk Area ini.' });
    }

    const objectiveDisplayLabel = resolvedObjectiveTarget;
    const domestikDisplayLabel = domestikLabel ? domestikLabel : domestikTarget;
    const internasionalDisplayLabel = internasionalLabel ? internasionalLabel : internasionalTarget;

    const stages = [
      { key: 'objective', label: objectiveDisplayLabel, target: resolvedObjectiveTarget },
      { key: 'domestik', label: domestikDisplayLabel, target: domestikTarget },
      { key: 'internasional', label: internasionalDisplayLabel, target: internasionalTarget }
    ];

    try {
      const gatewayResults = [];
      for (let i = 0; i < stages.length; i++) {
        if (testState.cancelled) { socket.emit('test:cancelled'); return; }
        const stage = stages[i];
        socket.emit('test:phase', { phase: 'ping', stageIndex: i, totalStages: stages.length + 1, label: stage.label, method: stage.method });
        
        const result = await runPingStage({
          socket, testState, stopFlags,
          target: stage.target, label: stage.label,
          allowTlsFallback: stage.key === 'domestik' && ['detik.com', 'tokopedia.com'].includes(String(stage.target).trim().toLowerCase().replace(/\.$/, '')),
          stageIndex: i, totalStages: stages.length + 1, count: DEFAULT_PING_COUNT
        });

        if (testState.cancelled) { socket.emit('test:cancelled'); return; }
        gatewayResults.push({ key: stage.key, label: stage.label, target: stage.target, ...result });
        socket.emit('test:ping-summary', computePingSummary(testState.combinedTimes));
      }

      if (testState.cancelled) { socket.emit('test:cancelled'); return; }
      socket.emit('test:phase', { phase: 'speedtest', stageIndex: stages.length, totalStages: stages.length + 1 });

      const TOTAL_RUN = DEFAULT_SPEEDTEST_RUNS;
      const runs = [];
      let speedtestFailed = false;
      let speedtestError = null;

      for (let testNumber = 1; testNumber <= TOTAL_RUN; testNumber++) {
        if (testState.cancelled) { socket.emit('test:cancelled'); return; }
        socket.emit('speedtest:test-progress', { testNumber, totalRun: TOTAL_RUN, phase: 'running' });
        try {
          const result = await runSpeedtestWithFallback((progress) => {
            socket.emit('speedtest:progress', {
              testNumber, totalRun: TOTAL_RUN, type: progress.type,
              progressPercent: progress.download?.progress ?? progress.upload?.progress ?? null,
              instMbps: bandwidthToMbps(progress.download?.bandwidth ?? progress.upload?.bandwidth)
            });
          }, testState);

          if (testState.cancelled) { socket.emit('test:cancelled'); return; }
          runs.push(result);
          socket.emit('speedtest:test-progress', { testNumber, totalRun: TOTAL_RUN, phase: 'done', result });
        } catch (err) {
          if (err.message === 'CANCELLED' || testState.cancelled) { socket.emit('test:cancelled'); return; }
          speedtestFailed = true;
          speedtestError = err.message;
          socket.emit('speedtest:error', { message: err.message });
          break;
        }
      }

      const avg = (key) => {
        const vals = runs.map((r) => r[key]).filter((v) => typeof v === 'number' && !isNaN(v));
        if (!vals.length) return null;
        return Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2));
      };

      const downloadMbps = speedtestFailed ? null : avg('downloadMbps');
      const uploadMbps = speedtestFailed ? null : avg('uploadMbps');
      const status = computeStatusLabel(downloadMbps);
      const pingStats = computePingSummary(testState.combinedTimes);
      const hotelSuggestion = getHotelSuggestion(downloadMbps, uploadMbps);
      const diagnosis = buildTestDiagnosis({
        gatewayResults,
        speedtestFailed,
        speedtestError,
        downloadMbps,
        uploadMbps
      });

      const entry = {
        time: new Date().toLocaleString('id-ID'),
        area,
        gateways: gatewayResults,
        downloadMbps,
        uploadMbps,
        status,
        pingStats,
        hotelSuggestion,
        diagnosis,
        speedtestSource: runs[0]?.source || null
      };

      const list = saveReportRow(entry);
      io.emit('report:updated', list);
      socket.emit('test:result', entry);

    } catch (err) {
      if (err.message === 'CANCELLED' || testState.cancelled) {
        socket.emit('test:cancelled');
      } else {
        socket.emit('test:error', { message: err.message });
      }
    } finally {
      testRunning = false;
    }
  });

  socket.on('stop-test', () => {
    testState.cancelled = true;
    if (testState.pingJobId) stopFlags.add(testState.pingJobId);
    if (testState.activeProbeSocket && !testState.activeProbeSocket.destroyed) {
      try { testState.activeProbeSocket.destroy(); } catch (e) {}
    }
    if (testState.speedtestProc && !testState.speedtestProc.killed) {
      try { testState.speedtestProc.kill('SIGTERM'); } catch (e) {}
    }
    socket.emit('test:stopped');
  });

  socket.on('report:delete', ({ id }) => {
    try {
      if (!id) throw new Error('ID baris tidak valid.');
      const list = deleteReportRow(id);
      io.emit('report:updated', list);
    } catch (err) {
      socket.emit('report:save:error', { message: 'Gagal menghapus baris: ' + err.message });
    }
  });

  socket.on('report:reset', () => {
    try {
      fs.writeFileSync(JSON_PATH, '[]', 'utf-8');
      io.emit('report:updated', []);
    } catch (err) {
      socket.emit('report:save:error', { message: `Gagal reset laporan: ${err.message}` });
    }
  });

  socket.on('disconnect', () => {
    testState.cancelled = true;
    if (testState.pingJobId) stopFlags.add(testState.pingJobId);
    if (testState.activeProbeSocket && !testState.activeProbeSocket.destroyed) {
      try { testState.activeProbeSocket.destroy(); } catch (e) {}
    }
    if (testState.speedtestProc && !testState.speedtestProc.killed) {
      try { testState.speedtestProc.kill('SIGTERM'); } catch (e) {}
    }
  });
});

let resolveServerReady;
let rejectServerReady;
const serverReady = new Promise((resolve, reject) => {
  resolveServerReady = resolve;
  rejectServerReady = reject;
});

function startServer(currentPort = PORT, attemptsLeft = MAX_PORT_TRIES) {
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      startServer(currentPort + 1, attemptsLeft - 1);
      return;
    }
    rejectServerReady(err);
    console.error('Gagal menjalankan server:', err);
  });

  server.listen(currentPort, '127.0.0.1', () => {
    process.env.PORT = String(currentPort);
    console.log(`Aplikasi Pengujian Jaringan berjalan di http://127.0.0.1:${currentPort}`);
    resolveServerReady(currentPort);
  });
}

startServer();

module.exports = { server, serverReady };