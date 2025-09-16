# Otakuin API - Context for Qwen Code

## Project Overview

This project is a TypeScript-based API for streaming anime, built with Bun and ElysiaJS. It scrapes data from sources like Samehadaku and Nimegami, enriches it with data from Anilist, and provides a clean JSON API for clients. Key features include API key authentication, smart scraping and updating of anime lists, fuzzy title matching for Anilist data, manual mapping for incorrect matches, episode streaming proxies, and smart caching with Redis.

## Technologies

- **Runtime/Toolkit:** Bun
- **Web Framework:** ElysiaJS
- **Language:** TypeScript
- **Caching/Job Queue/Manual Map Storage:** Redis (Upstash)
- **HTML Parsing (Scraping):** Cheerio
- **Search/Matching:** Fuse.js
- **API Documentation:** Swagger (via `@elysiajs/swagger`)
- **Process Manager (Production):** PM2 (uses `ecosystem.config.cjs`)

## Building and Running

### Prerequisites

1.  Install [Bun](https://bun.sh/).
2.  (For Production) Install [PM2](https://pm2.keymetrics.io/) globally: `npm install -g pm2`

### Setup

1.  Clone the repository.
2.  Install dependencies: `bun install`
3.  Configure environment variables:
    *   Copy `.env.example` to `.env`: `cp .env.example .env`
    *   Edit `.env` and fill in the required values, especially `API_AUTH_ENABLED` and `API_KEY`.

### Running the Application

The application consists of two main processes: the main API server and a background worker that enriches scraped data with Anilist information.

#### For Development

Run the main server with auto-reload:
```bash
bun run dev
```

In a separate terminal, run the worker:
```bash
bun run worker
```

#### For Production (Recommended)

Use PM2 to manage both processes:
```bash
pm2 start ecosystem.config.cjs
```
This command starts both the main server and the worker as defined in `ecosystem.config.cjs`. You can monitor logs using `pm2 logs`.

## Development Conventions and Project Structure

- **Entry Points:**
  - `src/main.ts`: Starts the ElysiaJS server and schedules periodic update jobs (home page, top 10).
  - `src/worker.ts`: Runs a continuous loop to process jobs from a Redis queue, typically for enriching scraped anime data with Anilist information.
- **Core API Logic:**
  - `src/index.ts`: Configures the main ElysiaJS app, includes middleware (logging, error handling, security), sets up Swagger documentation, and defines the main route groups (`/api`).
  - `src/routes/`: Contains ElysiaJS route definitions for different API endpoints (e.g., `home.ts`, `anime.ts`, `stream.ts`, `search.ts`, `genre.ts`, `top10.ts`).
- **Libraries:**
  - `src/lib/`: Houses reusable modules like Redis connection (`redis.ts`), Anilist API interaction and fuzzy matching (`anilist.ts`), security middleware (`security.ts`), and logging (`logger.ts`, `request_logger.ts`).
- **Background Jobs/Cron:**
  - `src/cron/`: Contains logic for periodic tasks, such as updating the home page cache (`update_home.ts`) and the top 10 list (`update_top10.ts`).
- **Scrapers:**
  - `src/scrapers/`: (Not fully read, but inferred from `package.json` script) Contains logic for scraping data from external sources like Samehadaku and Nimegami.
- **Manual Mapping:**
  - `src/manual_map.ts`: Script to manually map an Anilist ID to a slug for a specific source (e.g., if automatic matching fails). This mapping is stored in a JSON file (`src/data/manual_map_<source>.json`) and synced to Redis.
  - `src/sync_map.ts`: Script to synchronize the manual mapping JSON files to Redis.
- **Utility Scripts:**
  - `src/scan.ts`: A utility script to perform a deep scan of an HTML page's structure and output it as JSON.
- **Configuration:**
  - `ecosystem.config.cjs`: PM2 configuration file for managing the application in production.
  - `.env`: Environment variables (not committed, use `.env.example` as a template).
  - `package.json`: Project dependencies and scripts.

## Key Scripts (via `bun run <script>`)

- `dev`: Starts the main API server in development mode with auto-reload.
- `start`: (Not recommended for production) Attempts to run both main server and worker in the foreground using `&`. Use PM2 instead.
- `worker`: Starts the background enrichment worker.
- `scrape`: Runs the scrapers to gather initial data (slug lists) from sources.
- `map <source> <anilistId> <slug>`: Manually creates a mapping between an Anilist ID and a source-specific slug.
- `sync:map <source>`: Synchronizes the manual mapping file for a source to Redis.
- `scan <url>`: Runs the HTML structure scanner utility on a given URL.

## API Security

API security is handled by the middleware in `src/lib/security.ts`. It checks for the `x-api-key` header on all requests under the `/api` path if the environment variable `API_AUTH_ENABLED` is set to `true`. The expected key value is defined by the `API_KEY` environment variable.

## Data Flow Overview

1.  **Scraping:** Periodic jobs (e.g., `updateHome`) or manual scripts (`bun run scrape`) scrape data (like anime titles and slugs) from external sources.
2.  **Queueing:** New or updated items from scraping are added to a Redis queue (`queue:enrichment`).
3.  **Enrichment (Worker):** The worker (`src/worker.ts`) continuously pulls jobs from the queue. For each job, it uses the scraped title/slug to search Anilist (via `src/lib/anilist.ts`).
4.  **Matching:** Anilist matching uses normalization and fuzzy search (Fuse.js) to find the best match. Manual mappings (from Redis/JSON files) are checked first.
5.  **Storage:** Enriched data (Anilist ID, title, image, score) is used to update the relevant cache in Redis (e.g., `home:anime_list`, `top10:anime_list`).
6.  **API Serving:** API endpoints (e.g., `/api/home`) fetch data from the Redis cache to respond to client requests.
7.  **Manual Correction:** If automatic matching is wrong, the `bun run map` script can create a manual mapping, which the worker will use in future enrichment jobs.