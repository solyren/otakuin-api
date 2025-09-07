# Otakuin API 🚀

> API Nonton Anime Gak Pake Ribet. Dibuat dengan ❤️ menggunakan Bun + ElysiaJS.

API tidak resmi yang simpel tapi powerful untuk streaming anime, mengambil data dari berbagai sumber populer dan menyajikannya dalam format JSON yang bersih.

---

### ✨ Fitur Utama

- ✅ **Daftar Anime Terbaru:** Dapetin list anime yang baru rilis langsung dari sumbernya.
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
    <img src="https://elysiajs.com/assets/logo.svg" alt="ElysiaJS" width="45" height="45"/>
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
- 💾 **Redis (Upstash):** Untuk caching data biar wusss.
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
    Lalu, isi semua variabel yang ada di dalam file `.env` tersebut. Nilai di bawah ini hanya contoh.
    ```dotenv
    UPSTASH_REDIS_REST_URL=...
    UPSTASH_REDIS_REST_TOKEN=...
    SAMEHADAKU_BASE_URL=https://v1.samehadaku.how
    ANIMESAIL_BASE_URL=https://154.26.137.28
    ```

4.  **Jalankan Server:**
    -   Untuk development (dengan auto-reload):
        ```bash
        bun run dev
        ```
    -   Untuk production:
        ```bash
        bun run start
        ```
    Server akan berjalan di `http://localhost:3000`.

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

---

### 📜 Skrip Tambahan

Proyek ini punya beberapa skrip tambahan yang bisa dijalankan via `bun run`:

-   `bun run scrape`: Menjalankan semua scraper (Samehadaku & Animesail) untuk mengumpulkan slug anime dan menyimpannya di Redis.
-   `bun run map`: Untuk memetakan Anilist ID ke slug anime secara manual jika otomatisasi gagal.
    ```bash
    # Contoh: bun run map samehadaku 153518 "bocchi-the-rock"
    bun run map <source> <anilistId> <slug>
    ```
-   `bun run sync:map`: Menyinkronkan file map manual dari `src/data/` ke Redis.

---

### 🤝 Kontribusi

Kontribusi sangat diterima! Kalau kamu nemu bug atau punya ide fitur, jangan ragu buat buka *issue* atau kirim *pull request*.

### 📄 Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).