import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The t3n SDK ships a WASM component; let Node resolve it directly instead of
  // having Next bundle it (which breaks its path/URL resolution at runtime).
  serverExternalPackages: ["@terminal3/t3n-sdk"],
};

export default nextConfig;
