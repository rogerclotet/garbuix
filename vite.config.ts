import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import babel from "@rolldown/plugin-babel";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import viteTsConfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vite";

function readBuildVersion() {
	try {
		const manifestPath = resolve(process.cwd(), "public/version.json");
		const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
			version?: string;
		};

		return manifest.version ?? "dev";
	} catch {
		return "dev";
	}
}

const config = defineConfig(() => {
	const port = Number(process.env.PORT ?? 3000);
	const isDockerDev = process.env.DOCKER_DEV === "true";
	const buildVersion = readBuildVersion();

	return {
		define: {
			__APP_VERSION__: JSON.stringify(buildVersion),
		},
		plugins: [
			devtools(),
			nitro(),
			viteTsConfigPaths({
				projects: ["./tsconfig.json"],
			}),
			tailwindcss(),
			tanstackStart(),
			viteReact(),
			babel({ presets: [reactCompilerPreset()] }),
		],
		server: isDockerDev
			? {
					host: "0.0.0.0",
					port,
					strictPort: true,
					watch: {
						usePolling: process.env.CHOKIDAR_USEPOLLING === "true",
					},
					hmr: {
						host: process.env.VITE_HMR_HOST ?? "localhost",
						clientPort: Number(process.env.VITE_HMR_CLIENT_PORT ?? port),
						port,
						protocol: process.env.VITE_HMR_PROTOCOL ?? "ws",
					},
				}
			: undefined,
		ssr: {
			noExternal: ["@posthog/react", "posthog-js"],
		},
	};
});

export default config;
