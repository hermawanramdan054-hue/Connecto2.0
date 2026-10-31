# 🚀 CONNECTO - WiFi Quality Tester Application (v7 Final)

Selamat datang di **Connecto**! Aplikasi desktop mandiri (desktop app) profesional yang dirancang khusus untuk menguji, mengukur, dan melaporkan kualitas jaringan Wi-Fi secara instan dan akurat. 

Aplikasi ini sekarang sudah dikemas secara mandiri (pre-packaged), sehingga sangat ramah digunakan oleh siapa saja—mulai dari pengguna awam hingga teknisi jaringan—tanpa perlu menyentuh atau memahami kode program di terminal.

---

## ✨ Fitur Utama Aplikasi
* 📡 **Gateway Otomatis per Area:** Mengukur kecepatan respons sinyal dari laptop ke router lokal Anda berdasarkan lokasi dropdown Area yang dipilih (CITARIK, SUAGI, LANTAI 4, DKK). Semua nama area ditulis dalam HURUF KAPITAL.
* 🗺️ **Multi-Target Domain (2 Dropdown Terpisah):** Mendukung pengetesan koneksi ke server Nasional / Domestik (Tokopedia, Detik, Kompas) hingga Internasional (Google, Cloudflare) secara terpisah.
* ⚡ **Speedtest Engine (Dengan Fallback Otomatis):** Mengukur kecepatan unduh (Download) dan unggah (Upload) menggunakan mesin Ookla CLI asli. Jika Ookla tidak ditemukan, sistem otomatis beralih ke skrip Python cadangan (`speedtest-cli`) di latar belakang agar pengetesan tidak pernah macet.
* 🗂️ **Sistem Tab Internal (In-App Tab):** Memadukan dua jendela utama dalam satu halaman ringkas untuk menghemat memori RAM laptop Anda:
  1. **📊 Dashboard / Tests:** Panel Pengujian Utama + Tabel Laporan Hasil Pengujian.
  2. **🌐 Speedtest Web Browser:** Satu jendela penuh yang memuat situs `speedtest.net` resmi secara langsung melalui `<iframe>`.
* 📸 **Fitur Ambil Bukti / Screenshot:** Menyediakan tombol jepretan layar otomatis untuk mengambil bukti visual pengujian seluruh area dashboard yang dilengkapi dengan watermark penanda waktu yang akurat (`Speedtest_Proof_YYYYMMDD_HHMM.png`).
* 📄 **Smart Report PDF:** Menyediakan tombol cetak laporan resmi berformat PDF dengan data hasil pengujian dan diagnosis koneksi.

---

## 🧱 Struktur Berkas Aplikasi (Untuk Pengembangan / Developer)
Jika Anda ingin mengembangkan atau memodifikasi kodingan aplikasi ini di masa depan, berikut adalah struktur petanya:


test.connecto/├── package.json              # Konfigurasi nama aplikasi, versi, ekstra aset, dan installer NSIS├── server.js                 # Backend utama (RegEx Parser teks CLI, database local, & rute API)├── main.js                   # Sistem pembungkus Electron Desktop Induk├── bin/                      # Folder utama tempat berkas speedtest.exe milik Ookla CLI berada├── scripts/│   ├── speedtest_fallback.py # Dipanggil OTOMATIS oleh server.js kalau Ookla CLI diblokir/tidak ada│   └── requirements.txt      # Dependency Python: speedtest-cli├── data/                     # Dibuat otomatis untuk menampung berkas laporan reports.json lokal└── public/                   # Antarmuka visual frontend (HTML, CSS, JS Dashboard Utama)


---

## 📥 Langkah Mudah Instalasi Bagi Pengguna Awam
Aplikasi ini sudah dikemas secara mandiri. **Anda TIDAK PERLU menginstal Node.js, Python, atau aplikasi rumit lainnya.**
1. Buka folder hasil unduhan Anda, lalu cari berkas pemasang resmi bernama **`Connecto.setup.exe`**.
2. Klik dua kali pada berkas tersebut untuk memulai instalasi.
3. ℹ️ *Catatan Keamanan Windows:* Jika muncul kotak biru bertuliskan *"Windows protected your PC"*, jangan panik. Klik tulisan **"More Info"** di kotak tersebut, lalu klik tombol **"Run Anyway"**.
4. Proses instalasi akan berjalan otomatis selama 5-10 detik.
5. Selesai! Ikon pintasan aplikasi bernama **`Connecto`** akan otomatis muncul di layar Desktop laptop Anda dan siap digunakan.

---

## 🎮 Panduan Cara Pemakaian (Langkah Demi Langkah)

### 1️⃣ Tahap Persiapan Jaringan
* Pastikan laptop Anda sudah terhubung ke jaringan Wi-Fi yang ingin diuji kualitasnya.
* Pastikan jaringan Wi-Fi tersebut memiliki **koneksi internet aktif yang sedang menyala ke luar**.

### 2️⃣ Membuka Aplikasi
* Klik dua kali ikon **`Connecto`** yang ada di Desktop laptop Anda.
* Kotak izin keamanan Windows (UAC) akan muncul meminta akses administrator. Klik tombol **`Yes`**. *(Izin ini wajib diberikan agar aplikasi mendapat jalan tol untuk menguji kecepatan jaringan latar belakang melalui perintah admin).*

### 3️⃣ Melakukan Pengujian Jaringan
* Pada tab **Dashboard / Tests**, pilih lokasi **Area**, pilih **Target Domestik**, dan pilih **Target Internasional**.
* Klik tombol besar berwarna biru bertuliskan **`Start`**.
* Urutan otomatis berjalan: Ping ke lokal gateway → Ping ke Domestik → Ping ke Internasional → Speedtest CLI berjalan di latar belakang (Jendela hitam CLI akan menyerap data secara real-time selama 15-30 detik lalu menutup sendiri).

### 4️⃣ Membaca & Mengunduh Hasil
* Setelah selesai, tabel menampilkan waktu respons gateway dan target pilihan, persentase pengujian berhasil/gagal, kecepatan **Download & Upload (Mbps)**, serta diagnosis hasil pengujian.
* Anda bisa langsung mengklik tombol **`Unduh Laporan (PDF)`** untuk mencetak atau menyimpan bukti resmi hasil analisis jaringan tersebut.

---

## 🔎 Pemetaan Kolom Laporan

| Kolom | Sumber Data & Cara Kerja Sistem |
| :--- | :--- |
| **Time** | Waktu dan tanggal presisi saat laporan hasil uji klik disimpan ke database lokal. |
| **Area** | Lokasi nama area dari dropdown yang dipilih user (CITARIK, SUAGI, DKK). |
| **Download / Upload** | Hasil kecepatan murni (Mbps) hasil terjemahan kustom RegEx Parser dari CLI atau fallback Python. |
| **Ping** | Nilai latency respons jaringan dari Speedtest menuju server terdekat. |
| **Jitter** | Diambil dari Speedtest; jika menggunakan fallback Python, dihitung otomatis dari variasi gabungan ping. |
| **Minimum / Maximum / Average**| Ringkasan waktu respons dari target yang dipilih selama tiga percobaan. |

---

## ⚠️ Batasan Sistem Keamanan Browser (Wajib Dipahami Developer & User)

1. **Kebijakan X-Frame-Options (Situs Speedtest.net Blank/Putih):**
   Server resmi `speedtest.net` memiliki kebijakan keamanan ketat (*CSP*) yang melarang situs mereka dimasukkan ke dalam aplikasi lain melalui `<iframe>`. Demi mematuhi hukum dan ToS Ookla, sistem tidak menggunakan *reverse-proxy*. 
   👉 **Solusi Pasti:** Aplikasi sudah menyediakan tombol **"Buka di Tab Baru"** di bagian atas tab web browser sebagai jalan keluar resmi yang aman 100%.
2. **Proteksi Piksel Gambar (Tainted Canvas pada Screenshot):**
   Sesuai standar keamanan sistem operasi modern, JavaScript dilarang keras memotret piksel dari domain luar yang berbeda (*cross-origin iframe*). 
   👉 **Efeknya:** Jika Anda mengambil screenshot saat tab *Speedtest Web Browser* aktif, area kotak web speedtest.net akan tampil putih polos di hasil gambar PNG.
   👉 **Solusi Bukti Visual:** Gunakan fitur jepretan layar bawaan laptop Anda (Windows: **`Win + Shift + S`**, macOS: **`Cmd + Shift + 4`**).

---

## 🗑️ Prosedur Reset Laporan
Tombol **"Reset Laporan"** di sebelah tombol unduh dirancang untuk membersihkan file database `data/reports.json` secara permanen agar tabel kosong kembali untuk pengujian hari baru. Data di-generate ulang secara on-demand, jadi selalu 100% sinkron.
* ⚠️ **Peringatan Penting:** Pastikan Anda sudah mengunduh laporan PDF terlebih dahulu sebelum menekan tombol ini, karena tindakan penghapusan data ini bersifat realtime dan tidak dapat dibatalkan.

---
*Aplikasi ini dikembangkan dengan standar kode terbaik yang kokoh, adaptif terhadap Windows Defender, serta dirancang agar awet dan mudah dioperasikan lintas generasi.*