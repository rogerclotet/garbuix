import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sentryTanstackStart } from "@sentry/tanstackstart-react/vite";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import babel from "@rolldown/plugin-babel";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig, loadEnv } from "vite";
import { getSecurityHeaders } from "./src/lib/security-headers.ts";

function readBuildVersions() {
	try {
		const manifestPath = resolve(process.cwd(), "public/version.json");
		const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
			serviceWorkerVersion?: string;
			sentryRelease?: string;
		};

		return {
			sentryRelease: manifest.sentryRelease,
			serviceWorkerVersion: manifest.serviceWorkerVersion ?? "dev",
		};
	} catch {
		return { serviceWorkerVersion: "dev", sentryRelease: undefined };
	}
}

const config = defineConfig(({ mode, command }) => {
	const buildEnv = loadEnv(mode, process.cwd(), ["SENTRY_", "VITE_"]);
	const uploadSourceMaps = Boolean(buildEnv.SENTRY_AUTH_TOKEN);
	if (
		command === "build" &&
		uploadSourceMaps &&
		(!buildEnv.SENTRY_ORG || !buildEnv.SENTRY_PROJECT)
	) {
		throw new Error("Source-map uploads require SENTRY_ORG and SENTRY_PROJECT");
	}
	const port = Number(process.env.PORT ?? 3000);
	const isDockerDev = process.env.DOCKER_DEV === "true";
	const buildVersions = readBuildVersions();
	const isTest = mode === "test";
	const plugins = isTest
		? [viteReact()]
		: [
				devtools(),
				nitro(),
				tailwindcss(),
				tanstackStart({
					importProtection: {
						client: {
							// This module is also loaded by Drizzle's CommonJS config
							// loader, so protect it here without a runtime marker import.
							specifiers: [/\/server-env(?:\.ts)?$/],
						},
					},
				}),
				viteReact(),
				babel({ presets: [reactCompilerPreset()] }),
				sentryTanstackStart({
					org: buildEnv.SENTRY_ORG,
					project: buildEnv.SENTRY_PROJECT,
					sentryUrl: buildEnv.SENTRY_URL || "https://sentry.io/",
					telemetry: false,
					authToken: buildEnv.SENTRY_AUTH_TOKEN,
					release: { name: buildVersions.sentryRelease },
					sourcemaps: { disable: !uploadSourceMaps },
				}),
			];

	return {
		nitro: {
			plugins: ["./src/server-plugins/graceful-shutdown.ts"],
			routeRules: {
				"/**": {
					headers: getSecurityHeaders(
						mode === "production",
						buildEnv.VITE_SENTRY_DSN,
					),
				},
			},
		},
		define: {
			__SENTRY_RELEASE__: JSON.stringify(buildVersions.sentryRelease) ?? "undefined",
			__APP_SERVICE_WORKER_VERSION__: JSON.stringify(
				buildVersions.serviceWorkerVersion,
			),
		},
		plugins,
		resolve: {
			tsconfigPaths: true,
		},
		optimizeDeps: {
			// The client dep scan follows the route tree into server-only routes
			// before Start strips them, and the bundler can't load a native binary.
			exclude: ["@napi-rs/canvas"],
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
		test: {
			setupFiles: ["./src/test/setup.ts"],
			// The Devvit app runs its own tests with node:test.
			exclude: ["**/node_modules/**", "**/.git/**", "reddit-app/**"],
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
