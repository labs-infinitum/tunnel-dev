import { CLOUDFLARE_API_BASE } from "./constants.js";
import { env } from "./env.js";
import type { CloudflareAPIResponse, CloudflareTunnel } from "./types.js";

async function cfRequest(
	endpoint: string,
	method = "GET",
	body?: unknown,
): Promise<CloudflareAPIResponse> {
	const response = await fetch(`${CLOUDFLARE_API_BASE}${endpoint}`, {
		method,
		headers: {
			Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
			"Content-Type": "application/json",
		},
		body: body ? JSON.stringify(body) : undefined,
	});

	if (!response.ok) {
		throw new Error(`Cloudflare API error: ${response.statusText}`);
	}

	const data = (await response.json()) as CloudflareAPIResponse;

	if (!data.success) {
		throw new Error(
			`Cloudflare API error: ${data.errors.map((e) => e.message).join(", ")}`,
		);
	}

	return data;
}

export async function getTunnel(
	accountId: string,
	tunnelName: string,
): Promise<CloudflareTunnel | null> {
	const data = await cfRequest(`/accounts/${accountId}/cfd_tunnel?name=${tunnelName}`);
	const tunnels = Array.isArray(data.result) ? data.result : [data.result];
	return (tunnels as CloudflareTunnel[]).find((t) => t.name === tunnelName) ?? null;
}

export async function createTunnel(
	accountId: string,
	tunnelName: string,
): Promise<CloudflareTunnel> {
	const data = await cfRequest(`/accounts/${accountId}/cfd_tunnel`, "POST", {
		name: tunnelName,
		config_src: "cloudflare",
	});
	return data.result as CloudflareTunnel;
}

export async function getTunnelToken(accountId: string, tunnelId: string): Promise<string> {
	const data = await cfRequest(`/accounts/${accountId}/cfd_tunnel/${tunnelId}/token`);
	if (typeof data.result === "string") return data.result;
	return (data.result as { token?: string }).token ?? "";
}

export async function verifyTunnelStatus(
	accountId: string,
	tunnelId: string,
): Promise<boolean> {
	try {
		const data = await cfRequest(`/accounts/${accountId}/cfd_tunnel/${tunnelId}`);
		const tunnel = data.result as CloudflareTunnel;
		return tunnel.status === "healthy" && (tunnel.connections?.length ?? 0) > 0;
	} catch {
		return false;
	}
}

export async function configureDNS(
	zoneId: string,
	hostname: string,
	tunnelId: string,
): Promise<void> {
	const existing = await cfRequest(
		`/zones/${zoneId}/dns_records?type=CNAME&name=${hostname}`,
	);
	const records = Array.isArray(existing.result) ? existing.result : [];
	const cname = `${tunnelId}.cfargotunnel.com`;

	if (records.length > 0) {
		const recordId = (records[0] as { id: string }).id;
		await cfRequest(`/zones/${zoneId}/dns_records/${recordId}`, "PUT", {
			type: "CNAME",
			name: hostname,
			content: cname,
			proxied: true,
		});
	} else {
		await cfRequest(`/zones/${zoneId}/dns_records`, "POST", {
			type: "CNAME",
			name: hostname,
			content: cname,
			proxied: true,
		});
	}
}

export async function configureIngressRule(
	accountId: string,
	tunnelId: string,
	hostname: string,
	target: string,
): Promise<void> {
	await cfRequest(`/accounts/${accountId}/cfd_tunnel/${tunnelId}/configurations`, "PUT", {
		config: {
			ingress: [
				{ hostname, service: target, originRequest: {} },
				{ service: "http_status:404" },
			],
		},
	});
}
