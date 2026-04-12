import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import babel from "@rolldown/plugin-babel";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
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

const config = defineConfig(({ mode }) => {
	const port = Number(process.env.PORT ?? 3000);
	const isDockerDev = process.env.DOCKER_DEV === "true";
	const buildVersion = readBuildVersion();
	const isTest = mode === "test";
	const plugins = isTest
		? [viteReact()]
		: [
				devtools(),
				nitro(),
				tailwindcss(),
				tanstackStart(),
				viteReact(),
				babel({ presets: [reactCompilerPreset()] }),
			];

	return {
		define: {
			__APP_VERSION__: JSON.stringify(buildVersion),
		},
		plugins,
		resolve: {
			tsconfigPaths: true,
		},
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
		test: {
			environmentMatchGlobs: [["src/components/**/*.test.tsx", "jsdom"]],
			server: {
				deps: {
					external: [
						"react",
						"react-dom",
						"react/jsx-runtime",
						"react/jsx-dev-runtime",
						/^react(?:\/.*)?$/,
						/^react-dom(?:\/.*)?$/,
					],
					fallbackCJS: true,
				},
			},
		},
	};
});

export default config;
