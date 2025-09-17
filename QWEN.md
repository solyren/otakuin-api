# Otakuin API Project Context

## Project Overview

Otakuin API is an unofficial anime streaming API that provides clean JSON data by scraping content from various popular sources and enriching it with information from Anilist. The API is built with Bun + ElysiaJS and offers features like API key authentication, smart anime data updating, episode streaming with proxying, and smart caching with Redis.

### Key Features
- API Key Authentication (can be enabled/disabled via environment variables)
- Smart anime data updating system with a worker queue
- Episode streaming with proxying for safer viewing
- Smart caching using Redis (Upstash)
- Interactive API documentation with Swagger
- Smart search algorithm for matching anime titles
- Manual mapping system for correcting title mismatches
- Top 10 weekly anime list
- Genre-based search with pagination

### Technologies Used
- **Runtime**: Bun (JavaScript/TypeScript runtime)
- **Framework**: ElysiaJS (web framework)
- **Language**: TypeScript
- **HTML Parsing**: Cheerio (for scraping)
- **Caching/Queue**: Redis (Upstash)
- **API Documentation**: Swagger
- **Search**: Fuse.js (fuzzy search)

## Project Structure

```
otakuin-api/
├── src/
│   ├── data/                   # Manual mapping files
│   ├── lib/                    # Utility libraries (redis, anilist, security, etc.)
│   ├── routes/                 # API route definitions
│   ├── scrapers/               # Anime source scrapers (samehadaku, nimegami)
│   ├── cron/                   # Scheduled tasks (home page, top 10 updates)
│   ├── index.ts                # App initialization
│   ├── main.ts                 # Main server entry point
│   ├── worker.ts               # Background worker for data enrichment
│   ├── manual_map.ts           # CLI tool for manual mapping
│   ├── sync_map.ts             # CLI tool to sync mapping files to Redis
│   ├── scan.ts                 # CLI tool for HTML structure scanning
│   └── scrapers/index.ts       # Scraper orchestrator
├── ecosystem.config.cjs        # PM2 configuration for production deployment
├── package.json                # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── .env.example               # Environment variables template
└── README.md                  # Project documentation
```

## Building and Running

### Prerequisites
- Bun runtime installed
- Redis instance (Upstash recommended)
- API keys for external services (Anilist doesn't require auth)

### Installation
1. Clone the repository
2. Install dependencies:
   ```bash
   bun install
   ```

### Environment Setup
Copy `.env.example` to `.env` and configure:
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` for Redis
- `SAMEHADAKU_BASE_URL` and `NIMEGAMI_BASE_URL` for scraping sources
- `API_AUTH_ENABLED` to enable/disable API key authentication
- `API_KEY` for API authentication when enabled

### Development
Run the development server with auto-reload:
```bash
bun run dev
```

In a separate terminal, run the worker process:
```bash
bun run worker
```

### Production
Use PM2 for production deployment:
```bash
# Install PM2 globally
npm install -g pm2

# Start both main server and worker
pm2 start ecosystem.config.cjs
```

### Available Scripts
- `bun run dev` - Run development server with auto-reload
- `bun run start` - Run both main server and worker processes
- `bun run worker` - Run the background worker for data enrichment
- `bun run scrape` - Run all scrapers to collect anime slugs
- `bun run map <source> <anilistId> <slug>` - Create manual mapping for anime
- `bun run sync:map <source>` - Sync manual mapping files to Redis
- `bun run scan <url>` - Scan HTML structure of a URL for debugging

## API Documentation

Interactive API documentation is available at `/docs` when the server is running. Key endpoints include:

- `GET /api/home` - Latest anime list
- `GET /api/anime/{id}` - Anime details
- `GET /api/anime/{id}/episode/{episode}` - Episode streaming sources
- `GET /api/anime/stream/{stream_id}` - Stream proxy endpoint
- `GET /api/search?q=...` - Search anime with pagination
- `GET /api/genre/{genre}` - Search by genre with pagination
- `GET /api/top10` - Top 10 weekly anime

When API authentication is enabled, all `/api` endpoints require the `x-api-key` header with a valid API key.

## Development Conventions

### Code Style
- TypeScript with strict typing
- ElysiaJS framework patterns
- Modular structure with separate files for routes, libraries, and utilities

### Data Flow
1. Scrapers collect anime slugs from sources and store them in Redis
2. Cron jobs periodically update home page and top 10 data
3. Worker processes enrich raw scraped data with Anilist information
4. Manual mapping can override automatic matching when needed
5. All data is cached in Redis for performance

### Smart Matching Algorithm
The system implements an advanced multi-level matching algorithm to accurately pair Anilist anime data with scraped source data:

1. **Primary Matching**: Uses Fuse.js for fuzzy string matching with titles from Anilist (romaji, english, native)
2. **Character-by-Character Similarity**: When Fuse.js doesn't find a good match, the system calculates similarity using Levenshtein distance
3. **Containment Detection**: Identifies when one title contains another (e.g., "Necronomico no Cosmic Horror Show" contains "Necronomico")
4. **Season/Part/Cour Handling**: Automatically handles variations like "Season 2", "2nd Season", "Part 3", etc.
5. **Fallback Mechanisms**: Uses home cache titles as a last resort when direct matching fails
6. **Priority System**: Prioritizes Samehadaku as the primary source for episode data

This intelligent matching system ensures accurate pairing of anime data without relying on exact string matches, making it robust against variations in title formatting across different sources.

### Error Handling
- Global error handlers in `src/index.ts`
- Detailed logging for debugging
- Graceful failure handling in scrapers and API calls

### Caching Strategy
- Redis is used for all caching needs
- Anilist data is cached for 24 hours
- Search results are cached for 1 hour
- Home page and top 10 data are updated on schedule
- Manual mappings are stored in Redis hash sets

### Testing
- Currently no automated test suite
- Manual testing through Swagger UI
- Error logging for debugging issues

## Key Components

### Scrapers
- `samehadaku_scraper.ts` and `nimegami_scraper.ts` collect anime slugs
- Run via `bun run scrape` command
- Store data in Redis hash sets

### Worker Process
- `worker.ts` enriches raw scraped data with Anilist information
- Processes jobs from Redis queue
- Handles manual mapping overrides
- Updates cached data in Redis

### Manual Mapping
- Corrects mismatches between scraped titles and Anilist data
- Stored in JSON files in `src/data/`
- Synced to Redis with `bun run sync:map`
- Can be updated with `bun run map`

### Security
- Optional API key authentication via `x-api-key` header
- Configurable via environment variables
- Applied to all `/api` routes when enabled

### Smart Matching System
- Advanced title matching algorithm using Fuse.js and character-by-character similarity
- Handles partial matches, containment, and variations in titles
- Supports season/part/cour detection and matching
- Fallback mechanisms for improved accuracy
- Prioritizes Samehadaku as the primary source for episode data

## Deployment
Production deployment uses PM2 with the configuration in `ecosystem.config.cjs` which runs both the main server and worker processes. The `NODE_TLS_REJECT_UNAUTHORIZED=0` environment variable is used to handle SSL certificate issues with some scraping sources.