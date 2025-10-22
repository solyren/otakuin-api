# Otakuin API

> A fast and reliable anime scraper API built with Bun, ElysiaJS, and Cheerio. Scrapes anime data from Samehadaku with a clean REST API interface.

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [API Documentation](#api-documentation)
  - [Base URL](#base-url)
  - [Endpoints](#endpoints)
- [Configuration](#configuration)
- [Development](#development)
- [Project Structure](#project-structure)
- [Contributing](#contributing)
- [License](#license)

## Features

- **Fast Performance** - Built on Bun runtime for maximum speed
- **Clean Architecture** - Layered structure with controllers, services, and middlewares
- **Type Safety** - Full TypeScript support
- **Structured Logging** - Beautiful logs with Pino
- **Code Quality** - ESLint & Prettier for consistent code style
- **Auto Reload** - Development mode with Nodemon
- **DOM Analysis Tool** - Built-in scanner to analyze website structure

## Tech Stack

| Technology | Purpose |
|------------|---------|
| [Bun](https://bun.sh) | Fast JavaScript runtime |
| [ElysiaJS](https://elysiajs.com) | Lightweight web framework |
| [Cheerio](https://cheerio.js.org) | HTML parsing & scraping |
| [Pino](https://getpino.io) | High-performance logging |
| [TypeScript](https://www.typescriptlang.org) | Type safety |
| [ESLint](https://eslint.org) | Code linting |
| [Prettier](https://prettier.io) | Code formatting |

## Installation

### Prerequisites

- [Bun](https://bun.sh) v1.2.22 or higher

### Steps

1. Clone the repository
```bash
git clone <repository-url>
cd otakuin
```

2. Install dependencies
```bash
bun install
```

3. Start the server
```bash
bun run start
```

The API will be running at `http://localhost:3000`

## Quick Start

### Development Mode (with auto-reload)
```bash
bun run dev
```

### Production Mode
```bash
bun run start
```

### Other Commands
```bash
# Scan website DOM structure
bun run scan <url>

# Lint code
bun run lint

# Auto-fix linting issues
bun run lint:fix

# Format code
bun run format
```

## API Documentation

### Base URL
```
http://localhost:3000
```

### Endpoints

#### 1. Health Check

Check if the API is running.

**Endpoint:** `GET /`

**Response:**
```json
{
  "message": "Otakuin API - Anime Scraper",
  "version": "1.0.0",
  "status": "running"
}
```

**Example:**
```bash
curl http://localhost:3000/
```

---

#### 2. Get Latest Anime

Retrieve the latest anime list from Samehadaku.

**Endpoint:** `GET /api/home`

**Response:**
```json
{
  "data": [
    {
      "title": "Ninja to Gokudou",
      "slug": "https://v1.samehadaku.how/anime/ninja-to-gokudou/",
      "cover": "https://v1.samehadaku.how/wp-content/uploads/2025/10/Ninja-to-Gokudou-Episode-3.jpg"
    },
    {
      "title": "Chitose-kun wa Ramune Bin no Naka",
      "slug": "https://v1.samehadaku.how/anime/chitose-kun-wa-ramune-bin-no-naka/",
      "cover": "https://v1.samehadaku.how/wp-content/uploads/2025/10/Chitose-kun-wa-Ramune-Bin-no-Naka-Episode-3.jpg"
    }
  ],
  "total": 16
}
```

**Example:**
```bash
curl http://localhost:3000/api/home
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `data` | Array | List of anime objects |
| `data[].title` | String | Anime title |
| `data[].slug` | String | Full URL to anime detail page |
| `data[].cover` | String | Cover image URL |
| `total` | Number | Total number of anime in the list |

## Configuration

### Environment Variables

Create a `.env` file in the root directory (optional):

```env
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
```

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `NODE_ENV` | `development` | Environment mode |
| `LOG_LEVEL` | `info` | Logging level (info, debug, error) |

## Development

### Project Architecture

This project follows a **layered architecture** with **provider-based structure** for scalability:

```
Routes → Controllers → Services → External APIs (Samehadaku, Otakudesu, etc.)
           ↓
      Middlewares
```

**Architecture Layers:**
- **Routes**: Define API endpoints (generic, e.g., `/api/home`)
- **Controllers**: Handle HTTP requests/responses (provider-specific, e.g., `samehadaku.controller.ts`)
- **Services**: Business logic and scraping (provider-specific, e.g., `samehadaku.service.ts`)
- **Middlewares**: Cross-cutting concerns (logging, error handling)

**Provider-based Structure:**
- Each scraper provider has its own service and controller files
- Routes remain generic and can switch between providers easily
- Easy to add new providers without modifying existing code
- Can aggregate data from multiple providers in one endpoint

### Adding New Endpoints

1. **Scan the target website** to understand its structure:
```bash
bun run scan https://target-website.com
```

2. **Create a service** in `src/services/`:
```typescript
// src/services/your-feature.service.ts
export const fetchYourData = async () => {
  // scraping logic
};
```

3. **Create a controller** in `src/controllers/`:
```typescript
// src/controllers/your-feature.controller.ts
export const getYourData = async () => {
  const data = await fetchYourData();
  return { data };
};
```

4. **Create a route** in `src/routes/`:
```typescript
// src/routes/your-feature.route.ts
export const yourRoute = new Elysia({ prefix: '/api' })
  .get('/your-endpoint', getYourData);
```

5. **Register the route** in `src/index.ts`:
```typescript
app.use(yourRoute);
```

6. **Update documentation** (README.md & AGENTS.md)

### Code Style

- Use `// -- functionName --` comments above every function
- Follow ESLint rules (run `bun run lint` to check)
- Use TypeScript types for everything
- Avoid `any` type
- Use `logger` instead of `console.log`

### Testing

Start the development server and test endpoints:

```bash
# Terminal 1: Start server
bun run dev

# Terminal 2: Test endpoints
curl http://localhost:3000/api/home
```

## Project Structure

```
otakuin/
├── src/
│   ├── config/              # Configuration files
│   │   ├── app.ts           # App settings (port, env)
│   │   └── logger.ts        # Pino logger setup
│   ├── controllers/         # Request handlers (provider-specific)
│   │   └── samehadaku.controller.ts
│   ├── services/            # Business logic (provider-specific)
│   │   └── samehadaku.service.ts
│   ├── middlewares/         # Middleware functions
│   │   └── logger.middleware.ts
│   ├── routes/              # API routes (generic)
│   │   └── home.route.ts
│   ├── types/               # TypeScript types
│   │   └── index.ts
│   ├── utils/               # Utility functions
│   │   └── scan.ts
│   └── index.ts             # Entry point
├── scripts/                 # Utility scripts
│   ├── scan.ts              # DOM scanner
│   └── test-scrape.ts       # Scraper testing
├── eslint.config.js         # ESLint configuration
├── .prettierrc.json         # Prettier configuration
├── nodemon.json             # Nodemon configuration
├── tsconfig.json            # TypeScript configuration
├── package.json             # Dependencies
└── README.md                # You are here

### Provider-based Structure

**For Samehadaku Provider:**
- `src/services/samehadaku.service.ts` - Scraping logic for Samehadaku
- `src/controllers/samehadaku.controller.ts` - Request handling for Samehadaku

**Generic Routes:**
- `src/routes/home.route.ts` - Generic endpoint that uses `samehadaku.controller`

**To Add New Provider (e.g., Otakudesu):**
1. Create `src/services/otakudesu.service.ts`
2. Create `src/controllers/otakudesu.controller.ts`
3. Update route to use the new controller or create provider-specific routes
```

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Follow** the code style (run `bun run lint`)
4. **Commit** your changes (`git commit -m 'Add amazing feature'`)
5. **Push** to the branch (`git push origin feature/amazing-feature`)
6. **Open** a Pull Request

### Commit Message Convention

```
feat: add new anime detail endpoint
fix: resolve scraping issue for special characters
docs: update API documentation
chore: update dependencies
refactor: improve service layer structure
```

## License

This project is open source and available under the [MIT License](LICENSE).

---

## Disclaimer

This project is for educational purposes only. Please respect the terms of service of the websites being scraped. The maintainers are not responsible for any misuse of this software.

---

**Made with ❤️ using Bun**
