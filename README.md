# Otakuin API 🚀

> API Nonton Anime Gak Pake Ribet. Dibuat dengan ❤️ menggunakan Bun + ElysiaJS.

API tidak resmi yang simpel tapi powerful untuk streaming anime, mengambil data dari berbagai sumber populer dan menyajikannya dalam format JSON yang bersih.

---

### ✨ Fitur Utama

- ✅ **Daftar Anime Terbaru:** Menggunakan sistem scraper-worker, daftar anime terbaru diambil secara berkala di latar belakang, memastikan data selalu fresh tanpa membebani API saat diminta.
- ✅ **Pencarian Berdasarkan Genre:** Cari anime berdasarkan genre dengan dukungan paginasi.
- ✅ **Pencocokan Judul Cerdas:** Algoritma pencarian pintar untuk mencocokkan judul dari sumber scrape dengan data di Anilist, bahkan jika namanya sedikit berbeda (misal: "Season 2" vs "2nd Season").
- ✅ **Pemetaan Manual Terintegrasi:** Kesalahan pencocokan dapat diperbaiki secara permanen menggunakan fitur pemetaan manual yang kini terintegrasi penuh dengan sistem pengambilan data halaman utama.
- ✅ **Detail Anime Lengkap:** Info detail dari Anilist (sinopsis, genre, gambar, dll).
- ✅ **Multi-sumber Stream:** Gak cuma satu, tapi cari link dari beberapa source (Samehadaku, Animesail).
- ✅ **Prioritas Sumber:** Mengambil daftar episode dari Samehadaku terlebih dahulu, dengan Animesail sebagai fallback.
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
    Lalu, isi semua variabel yang ada di dalam file `.env` tersebut.

4.  **Jalankan Server:**
    -   **Untuk Production:**
        ```bash
        # Menjalankan server utama dan worker di latar belakang
        bun run start
        ```
        Server akan berjalan di `http://localhost:3000`.

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

Di sana kamu bisa lihat semua endpoint yang tersedia, parameter yang dibutuhkan, dan bahkan mencoba langsung API-nya.

#### Ringkasan Endpoint

| Method | Endpoint                            | Deskripsi                                      |
| :----- | :---------------------------------- | :--------------------------------------------- |
| `GET`  | `/api/home`                         | Mengambil daftar anime terbaru.                |
| `GET`  | `/api/anime/{id}`                   | Mengambil detail sebuah anime.                 |
| `GET`  | `/api/anime/{id}/episode/{episode}` | Mendapatkan sumber stream untuk sebuah episode. |
| `GET`  | `/api/anime/stream/{stream_id}`     | Mem-proxy dan menayangkan video stream.        |
| `GET`  | `/api/search?q={keyword}`           | Mencari anime berdasarkan kata kunci.          |
| `GET`  | `/api/genre/{genre}`                | Mencari anime berdasarkan genre dengan paginasi. Mendukung query `page` dan `perPage`. |

### Contoh Implementasi

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

---

### 🤝 Kontribusi

Kontribusi sangat diterima! Kalau kamu nemu bug atau punya ide fitur, jangan ragu buat buka *issue* atau kirim *pull request*.

### 📄 Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).