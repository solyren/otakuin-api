# Otakuin API - Project Context for Qwen Code

## Project Overview

This is the **Otakuin API**, an unofficial, fast, and simple anime streaming API built with Bun and ElysiaJS. It scrapes data from popular sources, enriches it with information from Anilist, and provides a clean JSON API for clients. A key feature is its smart update mechanism to maintain stable IDs and its integrated manual mapping for data accuracy.

## Key Technologies

- **Runtime/Framework:** Bun + ElysiaJS
- **Language:** TypeScript
- **Caching/Queue/Mapping:** Redis (Upstash)
- **HTML Parsing:** Cheerio
- **Search:** Fuse.js
- **API Docs:** Swagger (via `@elysiajs/swagger`)
- **Process Management:** PM2 (for production)

## Core Architecture

1.  **Main API Server (`src/main.ts`, `src/index.ts`):** This is the core ElysiaJS application that defines routes and serves the API. It includes middleware for logging, error handling, and security (API key-based). It also sets up scheduled tasks (cron) to update the home and top 10 lists periodically.
2.  **Worker Process (`src/core/worker/index.ts`):** A separate background process that consumes a Redis queue (`queue:enrichment`). Its job is to enrich raw scraped anime data (titles, thumbnails) with detailed information from Anilist (IDs, ratings, better titles, images). This offloads the heavy API calls from the main server, improving responsiveness. It also handles applying manual mappings.
3.  **Data Scraping:** The API relies on scrapers (likely in `src/core/scrapers/`) to fetch raw anime data from sources like Samehadaku and Nimegami. These scrapers put raw data into the Redis enrichment queue for the worker to process.
4.  **Data Caching:** Frequently accessed data like the home list and top 10 list are stored in Redis (`home:anime_list`, `top10:anime_list`) for fast retrieval.
5.  **Manual Mapping (`src/manual_map.ts`, `src/sync_map.ts`):** A system to manually map a slug from a source website to a specific Anilist ID. This is used to correct mismatches from the automatic title matching algorithm. Mappings are stored in Redis (`manual_map:<source>:anilist_id_to_slug`).

## Building and Running

### Prerequisites

- Install [Bun](https://bun.sh/).
- A Redis instance (e.g., Upstash).

### Setup

1.  **Install Dependencies:**
    ```bash
    bun install
    ```
2.  **Configure Environment:**
    Copy `.env.example` to `.env` and fill in the required values (Redis credentials, base URLs for scrapers, API key).
    ```bash
    cp .env.example .env
    ```

### Running the Application

#### For Development

Run the main server and worker in separate terminals:

-   Terminal 1 (Main Server with auto-reload):
    ```bash
    bun run dev
    ```
-   Terminal 2 (Worker):
    ```bash
    bun run worker
    ```

#### For Production (Recommended)

Use PM2 for process management. This will run both the main API and the worker based on the `ecosystem.config.cjs` file.

1.  Install PM2 globally:
    ```bash
    npm install -g pm2
    ```
2.  Start the application:
    ```bash
    pm2 start ecosystem.config.cjs
    ```
    Monitor logs with `pm2 logs`.

### Key Scripts

-   `bun run worker`: Starts the background worker process.
-   `bun run scrape`: Runs the scrapers to gather raw anime data and put it in the queue.
-   `bun run map <source> <anilistId> <slug>`: Adds a manual mapping for a specific source, Anilist ID, and slug. (Note: The API key security script path in README seems incorrect, the actual check is in `src/lib/security.ts`).
-   `bun run sync:map <source>`: Synchronizes manual mapping files (likely in `src/data/`) to Redis.
-   `bun run scan <url>`: A utility script to deeply scan the HTML structure of a URL and output it as JSON, useful for developing scrapers.

## API Security

API key authentication can be enabled/disabled via the `API_AUTH_ENABLED` environment variable. If enabled (`true`), all requests to endpoints under `/api` must include the `x-api-key` header with the value set in the `API_KEY` environment variable. The check is implemented in `src/lib/security.ts`.

## API Documentation

Interactive API documentation is available via Swagger UI at `http://localhost:3000/docs` when the server is running.

## Development Conventions

- **Language:** TypeScript is used for type safety.
- **Framework:** ElysiaJS for routing and middleware.
- **Structure:** Code is organized under `src/` with clear separation for API routes (`src/api/`), core logic (`src/core/`), libraries (`src/lib/`), configuration (`src/config/`), and utility scripts (`src/*.ts` for map, scan, sync).
- **Logging:** Uses a custom logger (`src/lib/logger.ts`) for consistent logging.
- **Environment:** Uses `dotenv` for configuration, loaded via `src/config/index.ts`.
- **Error Handling:** Global uncaught exception and unhandled rejection handlers are set up.
- **Background Jobs:** Long-running tasks (like Anilist data fetching) are offloaded to a worker process using Redis as a queue.