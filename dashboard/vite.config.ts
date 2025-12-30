import path from "path";
import fs from "fs";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const certPath = "/Users/seanhunt/Code/.shared-certs";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 3003,
    strictPort: true,
    https: {
      key: fs.readFileSync(path.join(certPath, "key.pem")),
      cert: fs.readFileSync(path.join(certPath, "cert.pem")),
    },
    host: true,
    allowedHosts: [".dev.ecoworks.ca", "localhost"],
  },
});
