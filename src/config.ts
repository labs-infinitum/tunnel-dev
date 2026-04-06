import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { TunnelOptions, TunnelUserConfig } from "./types.js";

const singleConfigSchema = z.object({
	name: z.string(),
	hostname: z.string(),
	target: z.string().url(),
});

const configFileSchema = z.union([singleConfigSchema, z.array(singleConfigSchema)]);

/** Replace $VAR_NAME patterns with process.env values. */
function replaceEnv(source: string): string {
	return source.replace(/\$([A-Z_][A-Z0-9_]*)/g, (_, key) => process.env[key] ?? "");
}

function applyEnvSubstitution(config: TunnelUserConfig): TunnelUserConfig {
	return {
		name: replaceEnv(config.name),
		hostname: replaceEnv(config.hostname),
		target: config.target,
	};
}

async function loadPackageJsonConfig(): Promise<Partial<TunnelUserConfig> | null> {
	try {
		const raw = await readFile(join(process.cwd(), "package.json"), "utf-8");
		const pkg = JSON.parse(raw);
		const result = singleConfigSchema.safeParse(pkg.cloudflare);
		if (!result.success) return null;
		return result.data;
	} catch {
		return null;
	}
}

async function loadConfigFile(): Promise<TunnelUserConfig | TunnelUserConfig[] | null> {
	try {
		const { createJiti } = await import("jiti");
		const jiti = createJiti(import.meta.url);
		const configPath = join(process.cwd(), "tunnel.config.ts");
		const mod = await jiti.import(configPath, { default: true });
		const result = configFileSchema.safeParse(mod);
		if (!result.success) return null;
		return result.data as TunnelUserConfig | TunnelUserConfig[];
	} catch {
		return null;
	}
}

/**
 * Resolve the final tunnel configs by merging all sources.
 * Returns an array (always). Priority (highest → lowest):
 *   CLI flags / programmatic options → env vars → tunnel.config.ts → package.json
 *
 * If CLI flags are provided, they produce a single-tunnel override.
 * If tunnel.config.ts exports an array, all tunnels are returned (env var substitution applied).
 */
export async function resolveConfig(options?: TunnelOptions): Promise<TunnelUserConfig[]> {
	const fromPackageJson = await loadPackageJsonConfig();
	const fromConfigFile = await loadConfigFile();

	const fromEnv: Partial<TunnelUserConfig> = {
		...(process.env.TUNNEL_NAME && { name: process.env.TUNNEL_NAME }),
		...(process.env.TUNNEL_HOSTNAME && { hostname: process.env.TUNNEL_HOSTNAME }),
		...(process.env.TUNNEL_TARGET && { target: process.env.TUNNEL_TARGET }),
	};

	const hasCliOverrides = options?.name || options?.hostname || options?.target;

	// If tunnel.config.ts returns an array AND no CLI overrides, use the array directly.
	if (Array.isArray(fromConfigFile) && !hasCliOverrides) {
		return fromConfigFile.map(applyEnvSubstitution);
	}

	// Single-tunnel merge: CLI flags > env vars > tunnel.config.ts (single) > package.json
	const base = Array.isArray(fromConfigFile) ? null : fromConfigFile;
	const merged = {
		...fromPackageJson,
		...base,
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

	return [applyEnvSubstitution(merged as TunnelUserConfig)];
}

/**
 * Identity helper — provides type safety and IDE autocomplete for tunnel.config.ts files.
 * Accepts a single tunnel config or an array of tunnel configs.
 */
export function defineConfig(config: TunnelUserConfig | TunnelUserConfig[]): TunnelUserConfig | TunnelUserConfig[] {
	return config;
}
