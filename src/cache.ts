import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { CACHE_DIR } from "./constants.js";
import type { TunnelConfigCache } from "./types.js";

function cachePath(tunnelName: string): string {
	return join(homedir(), CACHE_DIR, `${tunnelName}.json`);
}

export async function loadTunnelCache(tunnelName: string): Promise<TunnelConfigCache | null> {
	try {
		const data = await readFile(cachePath(tunnelName), "utf-8");
		return JSON.parse(data) as TunnelConfigCache;
	} catch {
		return null;
	}
}

export async function saveTunnelCache(
	tunnelName: string,
	data: TunnelConfigCache,
): Promise<void> {
	const dir = join(homedir(), CACHE_DIR);
	await mkdir(dir, { recursive: true });
	await writeFile(cachePath(tunnelName), JSON.stringify(data, null, 2));
}
