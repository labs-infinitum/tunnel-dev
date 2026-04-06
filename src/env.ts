import { z } from "zod";

const envSchema = z.object({
	CLOUDFLARE_API_TOKEN: z.string(),
	CLOUDFLARE_ACCOUNT_ID: z.string(),
	CLOUDFLARE_ZONE_ID: z.string(),
});

export type CloudflareEnv = z.infer<typeof envSchema>;

/**
 * Validates and returns Cloudflare credentials from process.env.
 * Called lazily (inside functions) so importing this module never throws.
 */
export function getEnv(): CloudflareEnv {
	return envSchema.parse(process.env);
}
