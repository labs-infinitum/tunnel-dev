import { defineConfig } from "tsup";

export default defineConfig([
	{
		entry: { index: "src/index.ts" },
		format: ["esm"],
		dts: true,
		clean: true,
		target: "node18",
		external: ["cloudflared", "jiti"],
	},
	{
		entry: { cli: "src/cli.ts" },
		format: ["esm"],
		dts: false,
		target: "node18",
		external: ["cloudflared", "jiti"],
		banner: {
			js: "#!/usr/bin/env node",
		},
	},
]);
