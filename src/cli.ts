import { parseArgs } from "node:util";
import { config as loadDotenv } from "dotenv";
import { withTunnel } from "./tunnel.js";

// Load .env from CWD before anything else so env vars are available
loadDotenv();

const { values, positionals } = parseArgs({
	args: process.argv.slice(2),
	options: {
		name: { type: "string" },
		hostname: { type: "string" },
		target: { type: "string" },
		verbose: { type: "boolean", short: "v" },
		help: { type: "boolean", short: "h" },
	},
	allowPositionals: true,
	strict: false,
});

if (values.help) {
	console.log(`
tunnel-dev — Zero-config Cloudflare Tunnel for local development

Usage:
  tunnel-dev [options] <command...>
  tunnel-dev --name my-tunnel --hostname dev.example.com npm run dev

Options:
  --name       Tunnel name (overrides config)
  --hostname   Public hostname to expose (overrides config)
  --target     Local server URL, e.g. http://localhost:3000 (overrides config)
  -v, --verbose  Show verbose output
  -h, --help   Show this help message

Config sources (highest → lowest priority):
  CLI flags → env vars (TUNNEL_NAME, TUNNEL_HOSTNAME, TUNNEL_TARGET)
  → tunnel.config.ts → package.json "cloudflare" field

Required env vars:
  CLOUDFLARE_API_TOKEN
  CLOUDFLARE_ACCOUNT_ID
  CLOUDFLARE_ZONE_ID
`);
	process.exit(0);
}

await withTunnel({
	name: values.name,
	hostname: values.hostname,
	target: values.target,
	verbose: values.verbose,
	command: positionals,
});
