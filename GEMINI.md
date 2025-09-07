# Gemini Project Context: otakuin-api

## Project Overview

This project is a TypeScript-based API named "otakuin-api". Its primary function is to scrape anime information and streaming sources from various websites, associate them with official data from Anilist, and provide a structured API for accessing this information.

**Core Technologies:**

*   **Runtime:** Bun
*   **Language:** TypeScript
*   **Framework:** Elysia.js (a fast, TypeScript-first web framework)
*   **Database/Cache:** Upstash Redis is used for caching scraped data, storing mappings, and managing stream session IDs.
*   **Web Scraping:** `cheerio` is used for parsing HTML.
*   **Fuzzy Searching:** `fuse.js` is used to match anime titles from different sources.
*   **HTTP Client:** `axios` and the native `fetch` API are used for making HTTP requests.

**Architecture:**

1.  **Scrapers (`src/lib/scraper*.ts`):** Scripts that scrape anime titles and slugs from "Samehadaku" and "AnimeSail". This data is stored in Redis Hashes.
2.  **Anilist Integration:** The API uses the public Anilist GraphQL API (`https://graphql.anilist.co`) to fetch official anime metadata (titles, descriptions, genres, images) using an anime ID.
3.  **Title Matching:** When a user requests an anime by its Anilist ID, the API uses `fuse.js` to perform a fuzzy search against the scraped titles from different sources to find the corresponding slug for that source.
4.  **Manual Mapping (`src/manual_map.ts`, `src/sync_map.ts`):** A system is in place to manually map an Anilist ID to a specific source slug if the fuzzy search fails. This mapping is stored in a JSON file (`src/data/manual_map.json`) and synced to Redis.
5.  **API Routes (`src/routes/*.ts`):**
    *   `/api/home`: Scrapes the latest updated anime from Samehadaku and enriches it with Anilist data.
    *   `/api/anime/:id`: Gets detailed information for a specific anime from Anilist.
    *   `/api/anime/:id/episode/:episode`: This is the core endpoint. It finds the corresponding slugs on "Samehadaku" and "AnimeSail" for a given Anilist ID, constructs the episode URL, scrapes the embed URLs for video players, and returns them with temporary stream IDs.
    *   `/api/anime/stream/:id`: This acts as a proxy/resolver for the actual video stream URL, handling different embed providers like Blogger, Filedon, Pixeldrain, and Wibufile. It's designed to bypass cross-origin issues and handle various stream-fetching logics.
6.  **Entrypoint (`src/index.ts`):** Sets up the Elysia server and registers the API routes.

## Building and Running

The project uses `bun` for package management and execution.

*   **Install Dependencies:**
    ```bash
    bun install
    ```

*   **Run the development server:**
    This command uses `nodemon` to automatically restart the server on file changes.
    ```bash
    bun run dev
    ```

*   **Start the server in production:**
    ```bash
    bun run start
    ```

*   **Run Utility Scripts:**
    *   `bun run scrape:slugs`: Scrapes all anime titles and slugs from Samehadaku and stores them in Redis.
    *   `bun run scrape:animesail`: Scrapes all anime titles and slugs from AnimeSail and stores them in Redis.
    *   `bun run map <anilistId> <slug>`: Manually map an Anilist ID to a slug (e.g., `bun run map 12345 /anime/one-piece`).
    *   `bun run sync:map`: Syncs the manual mappings from `src/data/manual_map.json` to Redis.
    *   `bun run scan <url>`: A utility script to deep-scan the DOM structure of a given URL.

## Development Conventions

*   **Configuration:** The application requires Upstash Redis credentials (`UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`) to be set in a `.env` file at the project root.
*   **Code Style:** The code is written in TypeScript with a focus on modern ESNext features. The `tsconfig.json` is configured with strict type checking.
*   **Data Flow:** The primary data flow involves scraping, storing in Redis, fetching from Redis, enriching with Anilist data, and then serving via the API.
*   **Error Handling:** The code includes basic error handling for network requests and data parsing, but could be improved.
*   **Security:** The stream proxy endpoint (`/api/anime/stream/:id`) uses temporary, expiring IDs stored in Redis to prevent direct, long-term access to the proxied stream URLs. It also forwards the client's IP to the streaming service in some cases.
