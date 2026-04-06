import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { access, mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { install } from "cloudflared";
import ora from "ora";

export async function startCloudflared(token: string): Promise<ChildProcess> {
	const installDir = join(homedir(), ".cloudflared", "bin");
	await mkdir(installDir, { recursive: true });

	const binPath = join(
		installDir,
		process.platform === "win32" ? "cloudflared.exe" : "cloudflared",
	);

	let installedPath: string;
	try {
		await access(binPath);
		installedPath = binPath;
	} catch {
		const spinner = ora("Installing cloudflared...").start();
		try {
			installedPath = await install(binPath);
			spinner.succeed("cloudflared installed");
		} catch (error) {
			spinner.fail("Failed to install cloudflared");
			throw error;
		}
	}

	const proc = spawn(installedPath, ["tunnel", "run", "--token", token.trim()], {
		stdio: ["ignore", "ignore", "ignore"],
	});

	proc.on("error", (error: Error) => {
		throw new Error(`Failed to start cloudflared: ${error.message}`);
	});

	return proc;
}
