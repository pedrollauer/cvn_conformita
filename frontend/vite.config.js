import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// Dev-only proxy so the frontend can call /api/... without CORS, against
// the Node backend (see ../app.ts) running on PORT (default 3000).
export default defineConfig({
    plugins: [react()],
    server: {
        proxy: {
            "/api": {
                target: "http://localhost:3000",
                changeOrigin: true,
                rewrite: function (path) { return path.replace(/^\/api/, ""); },
            },
        },
    },
});
