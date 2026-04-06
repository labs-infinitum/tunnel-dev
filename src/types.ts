export interface TunnelOptions {
	// Tunnel config (also settable via env vars / config file / package.json)
	name?: string;
	hostname?: string;
	target?: string;

	// Cloudflare API credentials (fall back to CLOUDFLARE_* env vars when omitted)
	apiToken?: string;
	accountId?: string;
	zoneId?: string;

	// Runtime options
	command?: string[];
	verbose?: boolean;
}

export interface TunnelUserConfig {
	name: string;
	hostname: string;
	target: string;
}

export interface TunnelConfigCache {
	tunnelId: string;
	hostname: string;
	target: string;
}

export interface CloudflareTunnel {
	id: string;
	name: string;
	created_at: string;
	status?: string;
	connections?: Array<{ id: string; colo_name?: string; uuid?: string }>;
}

export interface CloudflareAPIResponse {
	success: boolean;
	errors: Array<{ code: number; message: string }>;
	messages: string[];
	result: CloudflareTunnel | CloudflareTunnel[] | string | { token?: string };
}
