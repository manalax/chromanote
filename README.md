# chromanote

A minimalist, colourful knowledge base built as a Databricks App with [AppKit](https://developers.databricks.com/docs/appkit/v0/).

**Features**
- Markdown notes with a side-by-side editor/preview, `[[wikilinks]]` (autocomplete, backlinks, click-to-create) and a graph view
- Priorities, due dates (overdue / due-soon badges and filters), coloured tags, full-text search
- Per-note colour and font, plus app-wide defaults, app background colour and light/dark mode
- Image upload (paste, drop or button) stored in a Unity Catalog volume
- Archive and trash with restore
- A RAG assistant over your own notes: notes are chunked and embedded into pgvector on save; answers stream with citations linking back to the source notes, and chats are saved

**Architecture**
- `server/`: AppKit (Express) with the `lakebase`, `server` and `files` plugins. Routes live in `server/routes/*`; the schema (`chromanote` Postgres schema, created at startup) is in `server/lib/schema.ts`. Chat and embedding endpoints are called directly in `server/lib/serving.ts`; chunking, indexing and retrieval are in `server/lib/chunk.ts` and `server/lib/rag.ts`.
- `client/`: React + React Router + AppKit UI. Pages are in `client/src/pages`, shared components in `client/src/components`.
- `shared/wikilinks.ts`: the wikilink parser, used by both server and client.
- Data is per user, keyed by the `x-forwarded-email` header that Databricks Apps injects. Locally, `DEV_USER` is used instead.

**Resources** (declared in `databricks.yml`)
- Lakebase Postgres (with the `vector` extension)
- UC volume `workspace.chromanote.images` (`WRITE_VOLUME`)
- Serving endpoints `databricks-gpt-oss-120b` (chat) and `databricks-gte-large-en` (1024-dim embeddings), both `CAN_QUERY`

## Prerequisites

- Node.js v22+ and npm
- Databricks CLI (for deployment)
- Access to a Databricks workspace

## Databricks Authentication

### Local Development

For local development, configure your environment variables by creating a `.env` file:

```bash
cp .env.example .env
```

Edit `.env` and set the environment variables you need:

```env
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
DATABRICKS_APP_PORT=8000
# ... other environment variables, depending on the plugins you use
```

#### Lakebase Configuration

The Lakebase plugin requires additional environment variables for PostgreSQL connectivity. To learn how to configure the Lakebase plugin, see the [Lakebase plugin documentation](https://developers.databricks.com/docs/appkit/v0/plugins/lakebase).

### CLI Authentication

The Databricks CLI requires authentication to deploy and manage apps. Configure authentication using one of these methods:

#### OAuth U2M

Interactive browser-based authentication with short-lived tokens:

```bash
databricks auth login --host https://your-workspace.cloud.databricks.com
```

This will open your browser to complete authentication. The CLI saves credentials to `~/.databrickscfg`.

#### Configuration Profiles

Use multiple profiles for different workspaces:

```ini
[DEFAULT]
host = https://dev-workspace.cloud.databricks.com

[production]
host = https://prod-workspace.cloud.databricks.com
client_id = prod-client-id
client_secret = prod-client-secret
```

Deploy using a specific profile:

```bash
databricks bundle deploy --profile production
```

**Note:** Personal Access Tokens (PATs) are legacy authentication. OAuth is strongly recommended for better security.

## Getting Started

### Install Dependencies

```bash
npm install
```

### Development

Run the app in development mode with hot reload:

```bash
npm run dev
```

The app will be available at the URL shown in the console output.

### Build

Build both client and server for production:

```bash
npm run build
```

This creates:

- `dist/server.js` - Compiled server bundle
- `client/dist/` - Bundled client assets

### Production

Run the production build:

```bash
npm start
```

## Code Quality

There are a few commands to help you with code quality:

```bash
# Type checking
npm run typecheck

# Linting
npm run lint
npm run lint:fix

# Formatting
npm run format
npm run format:fix
```

## Deployment with Databricks Asset Bundles

### 1. Configure Bundle

Update `databricks.yml` with your workspace settings:

```yaml
targets:
  default:
    workspace:
      host: https://your-workspace.cloud.databricks.com
```

Make sure to replace all placeholder values in `databricks.yml` with your actual resource IDs.

### 2. Deploy

Deploy and start the app with a single command:

```bash
databricks apps deploy
```

`databricks apps deploy` validates the project, deploys it, starts the app, and prints its URL.

### Deploy to Production

1. Configure the production target in `databricks.yml`
2. Deploy to production:

```bash
databricks apps deploy -t prod
```

> **Restarting a stopped app:** apps stop after a period of inactivity. To start one again without redeploying, run `databricks apps start <APP_NAME>`.

## Project Structure

```
* client/          # React frontend
  * src/           # Source code
  * public/        # Static assets
* server/          # Express backend
  * server.ts      # Server entry point
  * routes/        # Routes
* shared/          # Shared types
* databricks.yml   # Bundle configuration
* app.yaml         # App configuration
* .env.example     # Environment variables example
```

## Tech Stack

- **Backend**: Node.js, Express
- **Frontend**: React.js, TypeScript, Vite, Tailwind CSS, React Router
- **UI Components**: Radix UI, shadcn/ui
- **Databricks**: AppKit SDK
