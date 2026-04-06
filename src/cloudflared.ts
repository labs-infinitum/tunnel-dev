import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { access, chmod, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import ora from "ora";

/** Maps Node.js platform/arch to the cloudflared GitHub release asset name. */
function getAssetName(): string {
	const platform = process.platform;
	const arch = process.arch;

	const platformMap: Record<string, string> = {
		darwin: "darwin",
		linux: "linux",
		win32: "windows",
	};

	const archMap: Record<string, string> = {
		x64: "amd64",
		arm64: "arm64",
		arm: "arm",
	};

	const p = platformMap[platform];
	const a = archMap[arch];

	if (!p || !a) {
		throw new Error(
			`Unsupported platform/architecture: ${platform}/${arch}. ` +
				"Install cloudflared manually from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
		);
	}

	return platform === "win32"
		? `cloudflared-${p}-${a}.exe`
		: `cloudflared-${p}-${a}`;
}

async function downloadCloudflared(destPath: string): Promise<void> {
	const assetName = getAssetName();
	const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/${assetName}`;

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(
			`Failed to download cloudflared from ${url}: ${response.statusText}`,
		);
	}

	const buffer = await response.arrayBuffer();
	await writeFile(destPath, Buffer.from(buffer));

	// Make executable on Unix
	if (process.platform !== "win32") {
		await chmod(destPath, 0o755);
	}
}

/** Returns the path to a cached cloudflared binary, downloading it if needed. */
async function ensureCloudflared(): Promise<string> {
	const binName = process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
	const binDir = join(homedir(), ".cloudflared", "bin");
	const binPath = join(binDir, binName);

	try {
		await access(binPath);
		return binPath;
	} catch {
		// Not cached — download from official Cloudflare GitHub releases
	}

	await mkdir(binDir, { recursive: true });

	const spinner = ora(
		"Downloading cloudflared from github.com/cloudflare/cloudflared...",
	).start();

	try {
		await downloadCloudflared(binPath);
		spinner.succeed("cloudflared downloaded");
		return binPath;
	} catch (error) {
		spinner.fail("Failed to download cloudflared");
		throw error;
	}
}

export async function startCloudflared(token: string): Promise<ChildProcess> {
	const binPath = await ensureCloudflared();

	const proc = spawn(binPath, ["tunnel", "run", "--token", token.trim()], {
		stdio: ["ignore", "ignore", "ignore"],
	});

	proc.on("error", (error: Error) => {
		throw new Error(`Failed to start cloudflared: ${error.message}`);
	});

	return proc;
}
