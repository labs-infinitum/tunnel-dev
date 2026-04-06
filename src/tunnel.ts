import { spawn } from "node:child_process";
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
import type { TunnelOptions } from "./types.js";

export async function withTunnel(options?: TunnelOptions): Promise<void> {
	const config = await resolveConfig(options);

	// Resolve Cloudflare credentials: options take priority over env vars.
	// getEnv() is called here (not at import time) so missing vars only throw
	// when withTunnel() is actually invoked.
	const env = (() => {
		const fromEnv = getEnv();
		return {
			CLOUDFLARE_API_TOKEN: options?.apiToken ?? fromEnv.CLOUDFLARE_API_TOKEN,
			CLOUDFLARE_ACCOUNT_ID: options?.accountId ?? fromEnv.CLOUDFLARE_ACCOUNT_ID,
			CLOUDFLARE_ZONE_ID: options?.zoneId ?? fromEnv.CLOUDFLARE_ZONE_ID,
		};
	})();

	const spinner = ora("Setting up Cloudflare Tunnel...").start();

	try {
		let tunnelId: string | null = null;

		// Check per-tunnel cache first
		const cached = await loadTunnelCache(config.name);

		const { CLOUDFLARE_API_TOKEN: apiToken, CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_ZONE_ID: zoneId } = env;

		if (cached?.tunnelId) {
			spinner.text = `Checking cached tunnel: ${config.name}`;
			const existing = await getTunnel(accountId, config.name, apiToken);

			if (existing && existing.id === cached.tunnelId) {
				tunnelId = cached.tunnelId;
				spinner.text = "Updating tunnel configuration...";
				await configureIngressRule(accountId, existing.id, config.hostname, config.target, apiToken);
				spinner.text = "Updating DNS record...";
				await configureDNS(zoneId, config.hostname, existing.id, apiToken);
				await saveTunnelCache(config.name, {
					tunnelId: existing.id,
					hostname: config.hostname,
					target: config.target,
				});
			}
		}

		if (!tunnelId) {
			spinner.text = `Checking for existing tunnel: ${config.name}`;
			const existing = await getTunnel(accountId, config.name, apiToken);

			if (existing) {
				tunnelId = existing.id;
				spinner.text = "Updating tunnel configuration...";
				await configureIngressRule(accountId, existing.id, config.hostname, config.target, apiToken);
				spinner.text = "Updating DNS record...";
				await configureDNS(zoneId, config.hostname, existing.id, apiToken);
				await saveTunnelCache(config.name, {
					tunnelId: existing.id,
					hostname: config.hostname,
					target: config.target,
				});
			} else {
				spinner.text = `Creating tunnel: ${config.name}`;
				const tunnel = await createTunnel(accountId, config.name, apiToken);
				tunnelId = tunnel.id;

				spinner.text = "Configuring tunnel...";
				await configureIngressRule(accountId, tunnel.id, config.hostname, config.target, apiToken);
				spinner.text = "Creating DNS record...";
				await configureDNS(zoneId, config.hostname, tunnel.id, apiToken);
				await saveTunnelCache(config.name, {
					tunnelId: tunnel.id,
					hostname: config.hostname,
					target: config.target,
				});
			}
		}

		if (!tunnelId) {
			throw new Error("Failed to obtain tunnel ID");
		}

		spinner.text = "Getting tunnel token...";
		const token = await getTunnelToken(accountId, tunnelId, apiToken);

		spinner.text = "Starting cloudflared...";
		const cloudflaredProcess = await startCloudflared(token);

		spinner.text = "Verifying tunnel status...";
		const isHealthy = await Promise.race([
			verifyTunnelStatus(accountId, tunnelId, apiToken),
			new Promise<boolean>((resolve) => setTimeout(() => resolve(false), VERIFICATION_TIMEOUT_MS)),
		]);

		if (isHealthy) {
			spinner.succeed(`Tunnel ready! Public URL: https://${config.hostname}`);
		} else {
			spinner.succeed(`Tunnel started! Public URL: https://${config.hostname}`);
			console.log("\nTunnel is running. Verification may take a few moments.");
		}

		// Resolve the command to run
		const command = options?.command?.length
			? options.command
			: process.argv.slice(2);

		if (command.length === 0) {
			console.error("No command provided to run");
			cloudflaredProcess.kill();
			process.exit(1);
		}

		console.log(`\nStarting: ${command.join(" ")}\n`);

		const childProcess = spawn(command[0], command.slice(1), {
			stdio: "inherit",
			shell: true,
		});

		const cleanup = () => {
			console.log("\n\nShutting down...");
			cloudflaredProcess.kill();
			childProcess.kill();
			process.exit(0);
		};

		process.on("SIGINT", cleanup);
		process.on("SIGTERM", cleanup);

		childProcess.on("exit", (code: number | null) => {
			cloudflaredProcess.kill();
			process.exit(code ?? 0);
		});
	} catch (error) {
		spinner.fail("Failed to set up tunnel");
		console.error((error as Error).message);
		process.exit(1);
	}
}
