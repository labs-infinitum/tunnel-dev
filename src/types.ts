export interface TunnelOptions {
	name?: string;
	hostname?: string;
	target?: string;
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
