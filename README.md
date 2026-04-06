# @labs-infinitum/tunnel-dev

Zero-config [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) for local development. Expose any local server through your own domain in one command — no manual dashboard setup, no port forwarding.

```bash
tunnel-dev bun run dev
# ✔ Tunnel ready! Public URL: https://alice-myapp.example.com
# Starting: bun run dev
```

- **Automatic** — creates the tunnel, DNS record, and ingress rule via Cloudflare API
- **Multi-tunnel** — define an array in `tunnel.config.ts` to start all tunnels in parallel
- **Per-developer URLs** — `$USER` interpolation gives every dev their own subdomain
- **Multi-source config** — `package.json`, `tunnel.config.ts`, env vars, or CLI flags
- **CLI + Library** — use as a command or call `withTunnel()` from your own scripts
- **Zero unofficial deps** — cloudflared binary downloaded directly from [cloudflare/cloudflared](https://github.com/cloudflare/cloudflared/releases) releases

---

## Prerequisites

You need a Cloudflare account with:
- A domain managed by Cloudflare DNS
- An API token with **Zone:DNS:Edit** and **Account:Cloudflare Tunnel:Edit** permissions

Set these three environment variables (add them to your `.env`):

```bash
CLOUDFLARE_API_TOKEN=your_api_token
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_ZONE_ID=your_zone_id
```

---

## Installation

```bash
# npm
npm install --save-dev @labs-infinitum/tunnel-dev

# bun
bun add -d @labs-infinitum/tunnel-dev

# pnpm
pnpm add -D @labs-infinitum/tunnel-dev

# or use without installing
npx @labs-infinitum/tunnel-dev bun run dev
```

---

## Quick Start

Add a `cloudflare` block to your `package.json` and a `dev:tunnel` script:

```json
{
  "scripts": {
    "dev": "vite dev",
    "dev:tunnel": "tunnel-dev bun run dev"
  },
  "cloudflare": {
    "name": "myapp-$USER",
    "hostname": "$USER-myapp.example.com",
    "target": "http://localhost:5173"
  }
}
```

Run it:

```bash
bun run dev:tunnel
# ✔ Tunnel ready! Public URL: https://alice-myapp.example.com
# Starting: bun run dev
```

`$USER` is replaced with your system username automatically, so each developer on the team gets their own isolated subdomain.

---

## Config Sources

@labs-infinitum/tunnel-dev merges config from multiple sources. Higher entries win:

| Priority | Source | Example |
|----------|--------|---------|
| 1 (highest) | CLI flags | `--name`, `--hostname`, `--target` |
| 2 | Programmatic options | `withTunnel({ name, hostname, target })` |
| 3 | `tunnel.config.ts` | `export default defineConfig({...})` |
| 4 | `package.json` `cloudflare` field | `"cloudflare": { ... }` |
| 5 (lowest) | Environment variables | `TUNNEL_NAME`, `TUNNEL_HOSTNAME`, `TUNNEL_TARGET` |

`name` and `hostname` support `$VAR` interpolation from `process.env` in any source.

---

## Configuration

### Option A — `package.json` field

The simplest option. Add a `cloudflare` block:

```json
{
  "cloudflare": {
    "name": "myapp-$USER",
    "hostname": "$USER-myapp.example.com",
    "target": "http://localhost:3000"
  }
}
```

| Field | Description |
|-------|-------------|
| `name` | Tunnel name in Cloudflare dashboard. Must be unique per account. |
| `hostname` | Public URL to expose (must be on your Cloudflare zone). |
| `target` | Local server to forward traffic to. |

### Option B — `tunnel.config.ts`

For TypeScript config with full IDE autocomplete. Accepts a single tunnel or an array:

```ts
import { defineConfig } from "@labs-infinitum/tunnel-dev";

// Single tunnel
export default defineConfig({
  name: "myapp-$USER",
  hostname: "$USER-myapp.example.com",
  target: "http://localhost:3000",
});
```

```ts
import { defineConfig } from "@labs-infinitum/tunnel-dev";

// Multiple tunnels — all start in parallel before your command runs
export default defineConfig([
  {
    name: "web-$USER",
    hostname: "$USER-web.example.com",
    target: "http://localhost:3001",
  },
  {
    name: "api-$USER",
    hostname: "$USER-api.example.com",
    target: "http://localhost:3000",
  },
]);
```

### Option C — Environment variables

Override any config field at runtime:

```bash
TUNNEL_NAME=myapp-alice \
TUNNEL_HOSTNAME=alice-myapp.example.com \
TUNNEL_TARGET=http://localhost:3000 \
tunnel-dev bun run dev
```

### Option D — CLI flags

Pass config inline without any config file:

```bash
tunnel-dev \
  --name myapp-alice \
  --hostname alice-myapp.example.com \
  --target http://localhost:3000 \
  bun run dev
```

---

## Monorepo Setup

There are two patterns for monorepos — pick what fits your workflow.

### Pattern A — single `tunnel.config.ts` at the root

Define all tunnels in one place and run a single command to start them all in parallel:

```
my-monorepo/
├── apps/
│   ├── web/         ← React frontend on :3001
│   └── server/      ← API server on :3000
├── tunnel.config.ts ← all tunnels here
└── package.json
```

**`tunnel.config.ts`**
```ts
import { defineConfig } from "@labs-infinitum/tunnel-dev";

export default defineConfig([
  {
    name: "myapp-web-$USER",
    hostname: "$USER-web.example.com",
    target: "http://localhost:3001",
  },
  {
    name: "myapp-api-$USER",
    hostname: "$USER-api.example.com",
    target: "http://localhost:3000",
  },
]);
```

**Root `package.json`**
```json
{
  "scripts": {
    "dev:tunnel": "tunnel-dev bun run dev"
  }
}
```

```bash
bun run dev:tunnel
# Setting up 2 tunnels in parallel...
#   Tunnel ready: https://alice-web.example.com
#   Tunnel ready: https://alice-api.example.com
# Starting: bun run dev
```

### Pattern B — per-app config in `package.json`

Each app declares its own tunnel config. Invoke `dev:tunnel` from each app's directory (or via Turborepo).

**`apps/web/package.json`**
```json
{
  "scripts": {
    "dev": "vite dev",
    "dev:tunnel": "tunnel-dev bun run dev"
  },
  "cloudflare": {
    "name": "myapp-web-$USER",
    "hostname": "$USER-web.example.com",
    "target": "http://localhost:3001"
  }
}
```

**`apps/server/package.json`**
```json
{
  "scripts": {
    "dev": "node src/index.js",
    "dev:tunnel": "tunnel-dev node src/index.js"
  },
  "cloudflare": {
    "name": "myapp-api-$USER",
    "hostname": "$USER-api.example.com",
    "target": "http://localhost:3000"
  }
}
```

> @labs-infinitum/tunnel-dev reads `package.json` from the **current working directory**, so each app picks up its own config automatically.

#### With Turborepo

Register `dev:tunnel` as a persistent task in `turbo.json`:

```json
{
  "tasks": {
    "dev:tunnel": {
      "cache": false,
      "persistent": true
    }
  }
}
```

Then run per-app tunnels in parallel:

```bash
turbo run dev:tunnel --filter=web --filter=server
```

### Shared domain across the team

Use `$USER` in your tunnel name and hostname so every developer gets a personal subdomain without conflicts:

```json
{
  "cloudflare": {
    "name": "myapp-web-$USER",
    "hostname": "$USER-web.example.com",
    "target": "http://localhost:3001"
  }
}
```

| Developer | Public URL |
|-----------|-----------|
| alice | `https://alice-web.example.com` |
| bob | `https://bob-web.example.com` |
| carol | `https://carol-web.example.com` |

---

## Programmatic API

Use @labs-infinitum/tunnel-dev as a library in your own scripts or tooling:

```ts
import { withTunnel } from "@labs-infinitum/tunnel-dev";

await withTunnel({
  // Tunnel config
  name: "myapp-dev",
  hostname: "dev.example.com",
  target: "http://localhost:3000",

  // Command to run after tunnel is ready
  command: ["bun", "run", "dev"],
});
```

### Passing Cloudflare credentials programmatically

If you manage credentials outside of environment variables (e.g. pulled from a secrets manager at runtime), pass them directly:

```ts
import { withTunnel } from "@labs-infinitum/tunnel-dev";

const secrets = await mySecretsManager.get("cloudflare");

await withTunnel({
  apiToken: secrets.apiToken,
  accountId: secrets.accountId,
  zoneId: secrets.zoneId,

  name: "myapp-dev",
  hostname: "dev.example.com",
  target: "http://localhost:3000",

  command: ["bun", "run", "dev"],
});
```

### `TunnelOptions` reference

```ts
interface TunnelOptions {
  // Tunnel config
  name?: string;      // Tunnel name (supports $VAR interpolation)
  hostname?: string;  // Public hostname (supports $VAR interpolation)
  target?: string;    // Local server URL, e.g. "http://localhost:3000"

  // Cloudflare API credentials (fall back to CLOUDFLARE_* env vars)
  apiToken?: string;
  accountId?: string;
  zoneId?: string;

  // Runtime
  command?: string[];  // Command to spawn after tunnel is ready
  verbose?: boolean;
}
```

### `defineConfig` helper

Provides type safety and IDE autocomplete for `tunnel.config.ts`. Accepts a single config or an array:

```ts
import { defineConfig } from "@labs-infinitum/tunnel-dev";

// Single tunnel
export default defineConfig({ name, hostname, target });

// Multiple tunnels — started in parallel before your command
export default defineConfig([
  { name, hostname, target },
  { name, hostname, target },
]);
```

---

## CLI Reference

```
tunnel-dev [options] <command...>
```

| Flag | Description |
|------|-------------|
| `--name` | Tunnel name (overrides all config sources) |
| `--hostname` | Public hostname (overrides all config sources) |
| `--target` | Local server URL (overrides all config sources) |
| `-v, --verbose` | Verbose output |
| `-h, --help` | Show help |

Everything after the options is treated as the command to run:

```bash
tunnel-dev --name my-tunnel bun run dev
tunnel-dev --hostname dev.example.com npm start
tunnel-dev --target http://localhost:8080 pnpm dev
```

---

## How It Works

1. Reads and merges config from all sources (package.json → tunnel.config.ts → env vars → CLI flags)
2. For each tunnel: checks `~/.cloudflared/tunnels/<name>.json` cache for an existing tunnel ID
3. Creates or reuses the tunnel via Cloudflare API
4. Configures the DNS CNAME record pointing to the tunnel
5. Sets the ingress rule routing your hostname to your local server
6. Downloads `cloudflared` binary from [cloudflare/cloudflared](https://github.com/cloudflare/cloudflared/releases) (cached at `~/.cloudflared/bin/`) and starts it
7. When multiple tunnels are configured, steps 2–6 run in parallel for all of them
8. Spawns your command once all tunnels are ready — everything shuts down together on `Ctrl+C`

> Each tunnel is cached per-name at `~/.cloudflared/tunnels/<name>.json`, so multiple projects never overwrite each other's tunnel state.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLOUDFLARE_API_TOKEN` | Yes | Cloudflare API token with DNS and Tunnel permissions |
| `CLOUDFLARE_ACCOUNT_ID` | Yes | Your Cloudflare account ID |
| `CLOUDFLARE_ZONE_ID` | Yes | Zone ID of your domain |
| `TUNNEL_NAME` | No | Override tunnel name |
| `TUNNEL_HOSTNAME` | No | Override public hostname |
| `TUNNEL_TARGET` | No | Override local server target |

---

## License

Apache 2.0 — see [LICENSE](./LICENSE)
