import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import ora from "ora";
import { loadTunnelCache, saveTunnelCache } from "./cache.js";
import {
	configureDNS,
	configureIngressRule,
	createTunnel,
	getTunnel,
	getTunnelToken,
	verifyTunnelStatus,
} from "./cloudflare-api.js";
import { startCloudflared } from "./cloudflared.js";
import { resolveConfig } from "./config.js";
import { VERIFICATION_TIMEOUT_MS } from "./constants.js";
import { getEnv } from "./env.js";
import type { TunnelOptions, TunnelUserConfig } from "./types.js";

interface ResolvedCredentials {
	CLOUDFLARE_API_TOKEN: string;
	CLOUDFLARE_ACCOUNT_ID: string;
	CLOUDFLARE_ZONE_ID: string;
}

async function setupOneTunnel(
	config: TunnelUserConfig,
	creds: ResolvedCredentials,
	log: (msg: string) => void,
): Promise<ChildProcess> {
	const { CLOUDFLARE_API_TOKEN: apiToken, CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_ZONE_ID: zoneId } = creds;
	let tunnelId: string | null = null;

	const cached = await loadTunnelCache(config.name);

	if (cached?.tunnelId) {
		log(`Checking cached tunnel: ${config.name}`);
		const existing = await getTunnel(accountId, config.name, apiToken);
		if (existing && existing.id === cached.tunnelId) {
			tunnelId = cached.tunnelId;
			log(`Updating configuration: ${config.name}`);
			await configureIngressRule(accountId, existing.id, config.hostname, config.target, apiToken);
			await configureDNS(zoneId, config.hostname, existing.id, apiToken);
			await saveTunnelCache(config.name, { tunnelId: existing.id, hostname: config.hostname, target: config.target });
		}
	}

	if (!tunnelId) {
		log(`Checking for existing tunnel: ${config.name}`);
		const existing = await getTunnel(accountId, config.name, apiToken);

		if (existing) {
			tunnelId = existing.id;
			log(`Updating configuration: ${config.name}`);
			await configureIngressRule(accountId, existing.id, config.hostname, config.target, apiToken);
			await configureDNS(zoneId, config.hostname, existing.id, apiToken);
			await saveTunnelCache(config.name, { tunnelId: existing.id, hostname: config.hostname, target: config.target });
		} else {
			log(`Creating tunnel: ${config.name}`);
			const tunnel = await createTunnel(accountId, config.name, apiToken);
			tunnelId = tunnel.id;
			await configureIngressRule(accountId, tunnel.id, config.hostname, config.target, apiToken);
			await configureDNS(zoneId, config.hostname, tunnel.id, apiToken);
			await saveTunnelCache(config.name, { tunnelId: tunnel.id, hostname: config.hostname, target: config.target });
		}
	}

	if (!tunnelId) throw new Error(`Failed to obtain tunnel ID for: ${config.name}`);

	log(`Getting token: ${config.name}`);
	const token = await getTunnelToken(accountId, tunnelId, apiToken);

	log(`Starting cloudflared: ${config.name}`);
	const cloudflaredProcess = await startCloudflared(token);

	const isHealthy = await Promise.race([
		verifyTunnelStatus(accountId, tunnelId, apiToken),
		new Promise<boolean>((resolve) => setTimeout(() => resolve(false), VERIFICATION_TIMEOUT_MS)),
	]);

	const status = isHealthy ? "ready" : "started";
	log(`Tunnel ${status}: https://${config.hostname}`);

	return cloudflaredProcess;
}

export async function withTunnel(options?: TunnelOptions): Promise<void> {
	const configs = await resolveConfig(options);

	// Resolve Cloudflare credentials: options take priority over env vars.
	// getEnv() is called here (not at import time) so missing vars only throw
	// when withTunnel() is actually invoked.
	const fromEnv = getEnv();
	const creds: ResolvedCredentials = {
		CLOUDFLARE_API_TOKEN: options?.apiToken ?? fromEnv.CLOUDFLARE_API_TOKEN,
		CLOUDFLARE_ACCOUNT_ID: options?.accountId ?? fromEnv.CLOUDFLARE_ACCOUNT_ID,
		CLOUDFLARE_ZONE_ID: options?.zoneId ?? fromEnv.CLOUDFLARE_ZONE_ID,
	};

	const multi = configs.length > 1;

	// For a single tunnel, use an animated spinner. For multiple, use plain log lines.
	let spinner: ReturnType<typeof ora> | null = null;
	let log: (msg: string) => void;

	if (!multi) {
		spinner = ora("Setting up Cloudflare Tunnel...").start();
		log = (msg: string) => {
			spinner!.text = msg;
		};
	} else {
		log = (msg: string) => console.log(`  ${msg}`);
	}

	let cloudflaredProcesses: ChildProcess[] = [];

	try {
		if (multi) {
			console.log(`Setting up ${configs.length} tunnels in parallel...`);
		}

		cloudflaredProcesses = await Promise.all(
			configs.map((config) => setupOneTunnel(config, creds, log)),
		);

		if (spinner) {
			spinner.succeed(`Tunnel ready! https://${configs[0].hostname}`);
		} else {
			console.log(`\nAll ${configs.length} tunnels are running.`);
		}
	} catch (error) {
		if (spinner) spinner.fail("Failed to set up tunnel");
		else console.error("Failed to set up tunnels");
		console.error((error as Error).message);
		cloudflaredProcesses.forEach((p) => p.kill());
		process.exit(1);
	}

	const command = options?.command?.length ? options.command : process.argv.slice(2);

	if (command.length === 0) {
		console.error("No command provided to run");
		cloudflaredProcesses.forEach((p) => p.kill());
		process.exit(1);
	}

	console.log(`\nStarting: ${command.join(" ")}\n`);

	const childProcess = spawn(command[0], command.slice(1), {
		stdio: "inherit",
		shell: true,
	});

	const cleanup = () => {
		console.log("\n\nShutting down...");
		cloudflaredProcesses.forEach((p) => p.kill());
		childProcess.kill();
		process.exit(0);
	};

	process.on("SIGINT", cleanup);
	process.on("SIGTERM", cleanup);

	childProcess.on("exit", (code: number | null) => {
		cloudflaredProcesses.forEach((p) => p.kill());
		process.exit(code ?? 0);
	});
}
