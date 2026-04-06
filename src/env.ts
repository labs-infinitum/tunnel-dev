import { z } from "zod";

const envSchema = z.object({
	CLOUDFLARE_API_TOKEN: z.string(),
	CLOUDFLARE_ACCOUNT_ID: z.string(),
	CLOUDFLARE_ZONE_ID: z.string(),
});

export const env = envSchema.parse(process.env);
