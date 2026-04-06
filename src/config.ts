import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { TunnelOptions, TunnelUserConfig } from "./types.js";

const packageJsonSchema = z.object({
	name: z.string(),
	hostname: z.string(),
	target: z.string().url(),
});

/** Replace $VAR_NAME patterns with process.env values. */
function replaceEnv(source: string): string {
	return source.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, key) => process.env[key] ?? "");
}

async function loadPackageJsonConfig(): Promise<Partial<TunnelUserConfig> | null> {
	try {
		const raw = await readFile(join(process.cwd(), "package.json"), "utf-8");
		const pkg = JSON.parse(raw);
		const result = packageJsonSchema.safeParse(pkg.cloudflare);
		if (!result.success) return null;
		return result.data;
	} catch {
		return null;
	}
}

async function loadConfigFile(): Promise<Partial<TunnelUserConfig> | null> {
	try {
		const { createJiti } = await import("jiti");
		const jiti = createJiti(import.meta.url);
		const configPath = join(process.cwd(), "tunnel.config.ts");
		const mod = await jiti.import(configPath, { default: true });
		const result = packageJsonSchema.safeParse(mod);
		if (!result.success) return null;
		return result.data as TunnelUserConfig;
	} catch {
		return null;
	}
}

/**
 * Resolve the final tunnel config by merging all sources.
 * Priority (highest → lowest):
 *   CLI flags / programmatic options → env vars → tunnel.config.ts → package.json
 */
export async function resolveConfig(options?: TunnelOptions): Promise<TunnelUserConfig> {
	const fromPackageJson = await loadPackageJsonConfig();
	const fromConfigFile = await loadConfigFile();

	const fromEnv: Partial<TunnelUserConfig> = {
		...(process.env.TUNNEL_NAME && { name: process.env.TUNNEL_NAME }),
		...(process.env.TUNNEL_HOSTNAME && { hostname: process.env.TUNNEL_HOSTNAME }),
		...(process.env.TUNNEL_TARGET && { target: process.env.TUNNEL_TARGET }),
	};

	const merged = {
		...fromPackageJson,
		...fromConfigFile,
		...fromEnv,
		...(options?.name && { name: options.name }),
		...(options?.hostname && { hostname: options.hostname }),
		...(options?.target && { target: options.target }),
	};

	if (!merged.name || !merged.hostname || !merged.target) {
		throw new Error(
			"Missing tunnel config: name, hostname, and target are required.\n" +
				"Provide them via package.json cloudflare field, tunnel.config.ts, " +
				"TUNNEL_NAME/TUNNEL_HOSTNAME/TUNNEL_TARGET env vars, or CLI flags.",
		);
	}

	return {
		name: replaceEnv(merged.name),
		hostname: replaceEnv(merged.hostname),
		target: merged.target,
	};
}

/** Identity helper — provides type safety and IDE autocomplete for tunnel.config.ts files. */
export function defineConfig(config: TunnelUserConfig): TunnelUserConfig {
	return config;
}
