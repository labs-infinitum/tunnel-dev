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
import { env } from "./env.js";
import type { TunnelOptions } from "./types.js";

export async function withTunnel(options?: TunnelOptions): Promise<void> {
	const config = await resolveConfig(options);

	const spinner = ora("Setting up Cloudflare Tunnel...").start();

	try {
		let tunnelId: string | null = null;

		// Check per-tunnel cache first
		const cached = await loadTunnelCache(config.name);

		if (cached?.tunnelId) {
			spinner.text = `Checking cached tunnel: ${config.name}`;
			const existing = await getTunnel(env.CLOUDFLARE_ACCOUNT_ID, config.name);

			if (existing && existing.id === cached.tunnelId) {
				tunnelId = cached.tunnelId;
				spinner.text = "Updating tunnel configuration...";
				await configureIngressRule(
					env.CLOUDFLARE_ACCOUNT_ID,
					existing.id,
					config.hostname,
					config.target,
				);
				spinner.text = "Updating DNS record...";
				await configureDNS(env.CLOUDFLARE_ZONE_ID, config.hostname, existing.id);
				await saveTunnelCache(config.name, {
					tunnelId: existing.id,
					hostname: config.hostname,
					target: config.target,
				});
			}
		}

		if (!tunnelId) {
			spinner.text = `Checking for existing tunnel: ${config.name}`;
			const existing = await getTunnel(env.CLOUDFLARE_ACCOUNT_ID, config.name);

			if (existing) {
				tunnelId = existing.id;
				spinner.text = "Updating tunnel configuration...";
				await configureIngressRule(
					env.CLOUDFLARE_ACCOUNT_ID,
					existing.id,
					config.hostname,
					config.target,
				);
				spinner.text = "Updating DNS record...";
				await configureDNS(env.CLOUDFLARE_ZONE_ID, config.hostname, existing.id);
				await saveTunnelCache(config.name, {
					tunnelId: existing.id,
					hostname: config.hostname,
					target: config.target,
				});
			} else {
				spinner.text = `Creating tunnel: ${config.name}`;
				const tunnel = await createTunnel(env.CLOUDFLARE_ACCOUNT_ID, config.name);
				tunnelId = tunnel.id;

				spinner.text = "Configuring tunnel...";
				await configureIngressRule(
					env.CLOUDFLARE_ACCOUNT_ID,
					tunnel.id,
					config.hostname,
					config.target,
				);
				spinner.text = "Creating DNS record...";
				await configureDNS(env.CLOUDFLARE_ZONE_ID, config.hostname, tunnel.id);
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
		const token = await getTunnelToken(env.CLOUDFLARE_ACCOUNT_ID, tunnelId);

		spinner.text = "Starting cloudflared...";
		const cloudflaredProcess = await startCloudflared(token);

		spinner.text = "Verifying tunnel status...";
		const isHealthy = await Promise.race([
			verifyTunnelStatus(env.CLOUDFLARE_ACCOUNT_ID, tunnelId),
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
