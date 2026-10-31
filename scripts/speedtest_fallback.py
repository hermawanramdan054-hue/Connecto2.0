#!/usr/bin/env python3
"""
speedtest_fallback.py
------------------------------------------------------------
FALLBACK speedtest — hanya dipanggil oleh server.js secara OTOMATIS
ketika Ookla Speedtest CLI ('speedtest') TIDAK ditemukan di sistem
(mis. error "speedtest is not recognized as an internal or external command").

Menggunakan library Python "speedtest-cli" (import speedtest).
Install dulu:
    pip install speedtest-cli

Output: satu baris JSON ke stdout, dibaca & di-parse oleh server.js.
Format:
    {"downloadMbps": .., "uploadMbps": .., "pingMs": .., "jitterMs": null}

Catatan penting:
- Library speedtest-cli TIDAK menyediakan metrik "jitter" resmi seperti
  Ookla CLI. Karena itu jitterMs di sini selalu null — server.js akan
  otomatis menghitung jitter perkiraan dari data 100x ping (lihat
  calcJitterFromTimes() di server.js) sebagai gantinya.
------------------------------------------------------------
"""
import json
import sys


def main():
    try:
        import speedtest  # pip install speedtest-cli
    except ImportError:
        print(json.dumps({
            "error": "Modul python 'speedtest' belum terinstal. Jalankan: pip install speedtest-cli"
        }))
        sys.exit(1)

    try:
        st = speedtest.Speedtest()
        st.get_best_server()

        download_bps = st.download()   # bit per second
        upload_bps = st.upload()       # bit per second
        ping_ms = st.results.ping

        result = {
            "downloadMbps": round(download_bps / 1_000_000, 2),
            "uploadMbps": round(upload_bps / 1_000_000, 2),
            "pingMs": round(ping_ms, 2) if ping_ms is not None else None,
            "jitterMs": None  # lihat catatan di atas
        }
        print(json.dumps(result))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
