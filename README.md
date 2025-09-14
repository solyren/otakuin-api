# Otakuin API 🚀

> API Nonton Anime Gak Pake Ribet. Dibuat dengan ❤️ menggunakan Bun + ElysiaJS.

API tidak resmi yang simpel tapi powerful untuk streaming anime, mengambil data dari berbagai sumber populer dan menyajikannya dalam format JSON yang bersih.

---

### ✨ Fitur Utama

- ✅ **Keamanan API Key:** Semua endpoint di bawah `/api` kini dilindungi oleh API Key. Fitur ini bisa diaktifkan atau dinonaktifkan melalui variabel environment untuk fleksibilitas.
- ✅ **Daftar Anime Konsisten & Real-time:** Menggunakan sistem scraper-worker dengan mekanisme *smart update*. Daftar anime terbaru diambil secara berkala tanpa menimpa data yang sudah ada, memastikan ID anime tidak pernah kembali ke `null` saat proses refresh.
- ✅ **Info Episode Terbaru:** Endpoint `/api/home` kini menyertakan `last_episode` untuk menunjukkan episode terakhir yang rilis.
- ✅ **Urutan Episode Descending:** Daftar episode di detail anime kini diurutkan dari yang terbaru ke yang terlama.
- ✅ **Top 10 Anime Mingguan:** Menyediakan daftar 10 anime terpopuler yang diperbarui secara otomatis setiap minggu.
- ✅ **Pencocokan Judul Cerdas:** Algoritma pencarian pintar untuk mencocokkan judul dari sumber scrape dengan data di Anilist, bahkan jika namanya sedikit berbeda (misal: "Season 2" vs "2nd Season").
- ✅ **Pemetaan Manual Terintegrasi:** Kesalahan pencocokan dapat diperbaiki secara permanen menggunakan fitur pemetaan manual.
- ✅ **Detail Anime Lengkap:** Info detail dari Anilist (sinopsis, genre, gambar, dll).
- ✅ **Multi-sumber Stream:** Gak cuma satu, tapi cari link dari beberapa source (Samehadaku, Animesail).
- ✅ **Proxy Stream:** Nonton langsung lewat API tanpa ribet, IP kamu lebih aman.
- ✅ **Caching Cerdas:** Pakai Redis buat nge-cache data, jadi akses lebih ngebut.
- ✅ **Dokumentasi Interaktif:** Dokumentasi lengkap dan bisa langsung dicoba pake Swagger.

### ⚠️ Peringatan

API ini bergantung pada *scraper* untuk mengambil konten dari situs pihak ketiga. Jika situs sumber mengubah struktur HTML-nya, ada kemungkinan beberapa fitur API akan gagal berfungsi sampai scraper-nya diperbarui.

### 🛠️ Teknologi yang Digunakan

<p align="left">
  <a href="https://bun.sh/" target="_blank">
    <img src="https://bun.sh/logo.svg" alt="Bun" width="45" height="45"/>
  </a>
  <a href="https://elysiajs.com/" target="_blank">
    <img src="https://cdn.simpleicons.org/elysia/E04A8B" alt="ElysiaJS" width="45" height="45"/>
  </a>
  <a href="https://www.typescriptlang.org/" target="_blank">
    <img src="https://cdn.simpleicons.org/typescript/3178C6" alt="TypeScript" width="45" height="45"/>
  </a>
  <a href="https://redis.io" target="_blank">
    <img src="https://cdn.simpleicons.org/redis/DC382D" alt="Redis" width="45" height="45"/>
  </a>
  <a href="https://swagger.io/" target="_blank">
    <img src="https://cdn.simpleicons.org/swagger/85EA2D" alt="Swagger" width="45" height="45"/>
  </a>
</p>

- ⚡️ **Bun:** JavaScript runtime & toolkit yang super cepat.
- 🦊 **ElysiaJS:** Framework web yang kencang dan ramah developer.
- 📜 **TypeScript:** Biar kode lebih aman dan terstruktur.
- 🤖 **Cheerio:** Untuk parsing HTML (proses scraping).
- 💾 **Redis (Upstash):** Untuk caching data, antrian pekerjaan (*job queue*), dan pemetaan manual.
- 📚 **Swagger:** Untuk dokumentasi API yang interaktif.

---

### ⚙️ Instalasi & Setup

1.  **Clone repository ini:**
    ```bash
    # Ganti dengan URL repo kamu
    git clone https://github.com/username/otakuin-api.git
    cd otakuin-api
    ```

2.  **Install dependencies:**
    Pastikan kamu sudah install [Bun](https://bun.sh/).
    ```bash
    bun install
    ```

3.  **Setup Environment Variables:**
    Salin file `.env.example` menjadi `.env`.
    ```bash
    cp .env.example .env
    ```
    Lalu, isi semua variabel yang ada di dalam file `.env` tersebut. Variabel yang paling penting adalah:
    - `API_AUTH_ENABLED`: Atur ke `true` untuk mengaktifkan keamanan API key, atau `false` untuk mematikannya.
    - `API_KEY`: Isi dengan kunci rahasia jika autentikasi diaktifkan.

4.  **Jalankan Server:**

    -   **Untuk Production (Rekomendasi):**
        Gunakan [PM2](https://pm2.keymetrics.io/) untuk menjalankan aplikasi di mode production. PM2 akan menjaga aplikasi tetap berjalan (auto-restart) dan mempermudah pengelolaan proses.

        a. **Install PM2:**
        ```bash
        npm install -g pm2
        ```

        b. **Jalankan dengan file konfigurasi:**
        Saya sudah menyediakan file `ecosystem.config.js` untuk mempermudah setup. Cukup jalankan perintah berikut dari root direktori proyek:
        ```bash
        pm2 start ecosystem.config.cjs
        ```
        PM2 akan secara otomatis menjalankan server utama dan proses worker di latar belakang. Anda bisa memonitor log dengan `pm2 logs`.

    -   **Untuk Development:**
        Jalankan masing-masing perintah di terminal terpisah.
        ```bash
        # Terminal 1: Menjalankan server utama dengan auto-reload
        bun run dev
        ```
        ```bash
        # Terminal 2: Menjalankan worker untuk memproses data
        bun run worker
        ```

---

### 📖 Dokumentasi API

Dokumentasi API lengkap dan interaktif tersedia melalui Swagger UI. Setelah server berjalan, buka URL berikut di browser kamu:

**👉 `http://localhost:3000/docs` 👈**

**Penting:** Jika `API_AUTH_ENABLED` diatur ke `true`, setiap permintaan ke endpoint di bawah `/api` harus menyertakan header `x-api-key` dengan API key yang valid.

#### Ringkasan Endpoint

| Method | Endpoint                            | Deskripsi                                      |
| :----- | :---------------------------------- | :--------------------------------------------- |
| `GET`  | `/api/home`                         | Mengambil daftar anime terbaru.                |
| `GET`  | `/api/anime/{id}`                   | Mengambil detail sebuah anime.                 |
| `GET`  | `/api/anime/{id}/episode/{episode}` | Mendapatkan sumber stream untuk sebuah episode. |
| `GET`  | `/api/anime/stream/{stream_id}`     | Mem-proxy dan menayangkan video stream.        | 
| `GET`  | `/api/search`                       | Mencari anime berdasarkan kata kunci dengan paginasi. Mendukung query `q`, `page`, dan `perPage`.          |
| `GET`  | `/api/genre/{genre}`                | Mencari anime berdasarkan genre dengan paginasi. Mendukung query `page` dan `perPage`. |
| `GET`  | `/api/top10`                        | Mengambil daftar 10 anime teratas minggu ini.  |


### Contoh Implementasi

#### Mengambil Daftar Anime Terbaru

**Endpoint:**
`GET /api/home`

**Header (jika auth aktif):**
`x-api-key: your-secret-api-key`

**Contoh Respons Sukses:**
Respons akan berisi daftar anime yang sudah diperkaya dengan data dari Anilist.

```json
[
  {
    "id": 16498,
    "title": "Shingeki no Kyojin",
    "thumbnail": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-C6b2O839Dk4p.jpg",
    "rating": 85,
    "last_episode": 12
  },
  {
    "id": 153518,
    "title": "Bocchi the Rock!",
    "thumbnail": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx153518-7FNR9GfFFh43.jpg",
    "rating": 88,
    "last_episode": 12
  }
]
```

#### Mengambil Daftar Top 10 Anime

**Endpoint:**
`GET /api/top10`

**Header (jika auth aktif):**
`x-api-key: your-secret-api-key`

**Contoh Respons Sukses:**
Respons akan berisi daftar 10 anime teratas yang sudah diperkaya dengan data dari Anilist.

```json
[
  {
    "id": 21,
    "title": "One Piece",
    "thumbnail": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-tQc9Q8tLgQzQ.png",
    "rating": 87,
    "rank": 1
  },
  {
    "id": 184237,
    "title": "Sakamoto Days Cour 2",
    "thumbnail": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx184237-OJAksU2fsIPx.jpg",
    "rating": 78,
    "rank": 2
  }
]
```

#### Pencarian Anime Berdasarkan Kata Kunci

Fitur ini memungkinkan pengguna untuk mencari anime berdasarkan kata kunci dengan dukungan paginasi.

**Endpoint:**
`GET /api/search`

**Parameter Query:**
-   `q` (wajib): Kata kunci pencarian.
-   `page` (opsional): Nomor halaman yang ingin ditampilkan (default: `1`).
-   `perPage` (opsional): Jumlah item per halaman (default: `20`).

**Contoh Penggunaan:**

1.  **Mencari "naruto" halaman pertama (20 item):**
    ```
    GET /api/search?q=naruto
    ```

2.  **Mencari "one piece" halaman kedua dengan 5 item per halaman:**
    ```
    GET /api/search?q=one%20piece&page=2&perPage=5
    ```

**Contoh Respons Sukses:**
Sama seperti pencarian berdasarkan genre, respons akan berisi `pageInfo` dan `anime`.

#### Pencarian Anime Berdasarkan Genre

Fitur ini memungkinkan pengguna untuk mencari dan menampilkan daftar anime berdasarkan genre tertentu dengan dukungan paginasi.

**Endpoint:**
`GET /api/genre/{nama_genre}`

**Parameter Path:**
-   `{nama_genre}`: Genre anime yang ingin dicari (contoh: `Action`, `Comedy`, `Romance`).

**Parameter Query (Opsional):**
-   `page`: Nomor halaman yang ingin ditampilkan (default: `1`).
-   `perPage`: Jumlah item per halaman (default: `20`).

**Contoh Penggunaan:**

1.  **Mendapatkan halaman pertama dari genre "Action" (20 item):**
    ```
    GET /api/genre/Action
    ```

2.  **Mendapatkan halaman kedua dari genre "Action" dengan 5 item per halaman:**
    ```
    GET /api/genre/Action?page=2&perPage=5
    ```

**Contoh Respons Sukses:**

Respons akan berisi informasi paginasi (`pageInfo`) dan daftar anime (`anime`).

```json
{
  "pageInfo": {
    "total": 5281,
    "currentPage": 1,
    "lastPage": 265,
    "hasNextPage": true,
    "perPage": 20
  },
  "anime": [
    {
      "id": 16498,
      "title": {
        "romaji": "Shingeki no Kyojin",
        "english": "Attack on Titan",
        "native": "進撃の巨人"
      },
      "coverImage": "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx16498-C6b2O839Dk4p.jpg",
      "rating": 85
    }
  ]
}
```

**Implementasi di Frontend (Contoh: Infinite Scroll)**

1.  **State Management:** Simpan state untuk `page`, `hasNextPage`, dan daftar anime.
2.  **Initial Fetch:** Saat komponen dimuat, panggil API dengan `page=1`. Simpan hasilnya dan status `hasNextPage`.
3.  **Trigger Fetch Berikutnya:** Ketika pengguna scroll ke bagian bawah daftar, periksa apakah `hasNextPage` bernilai `true`.
4.  **Load More:** Jika `true`, panggil lagi API dengan menaikkan nomor `page` (`page + 1`). Tambahkan hasil baru ke daftar anime yang sudah ada.
5.  Ulangi langkah 3 dan 4 sampai `hasNextPage` menjadi `false`.


--- 

### 📜 Skrip Tambahan

Proyek ini punya beberapa skrip tambahan yang bisa dijalankan via `bun run`:

-   `bun run worker`: Menjalankan proses worker di latar belakang yang bertugas mengambil data dari Anilist secara perlahan.
-   `bun run scrape`: Menjalankan semua scraper (Samehadaku & Animesail) untuk mengumpulkan slug anime dan menyimpannya di Redis.
-   `bun run map`: Untuk memetakan Anilist ID ke slug anime secara manual jika otomatisasi gagal.
    ```bash
    # Contoh: bun run map samehadaku 153518 "bocchi-the-rock"
    bun run map <source> <anilistId> <slug>
    ```
-   `bun run sync:map`: Menyinkronkan file map manual dari `src/data/` ke Redis.
    ```bash
    # Contoh: bun run sync:map samehadaku
    bun run sync:map <source>
    ```
-   `bun run scan <url>`: Melakukan scan mendalam pada struktur HTML sebuah URL dan menampilkannya dalam format JSON.

---

### 🤝 Kontribusi

Kontribusi sangat diterima! Kalau kamu nemu bug atau punya ide fitur, jangan ragu buat buka *issue* atau kirim *pull request*.

### 📄 Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).