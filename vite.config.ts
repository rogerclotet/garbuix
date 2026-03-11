import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import viteTsConfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vite";

const config = defineConfig(() => {
	const port = Number(process.env.PORT ?? 3000);
	const isDockerDev = process.env.DOCKER_DEV === "true";

	return {
		plugins: [
			devtools(),
			nitro(),
			viteTsConfigPaths({
				projects: ["./tsconfig.json"],
			}),
			tailwindcss(),
			tanstackStart(),
			viteReact({
				babel: {
					plugins: ["babel-plugin-react-compiler"],
				},
			}),
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
	};
});

export default config;
