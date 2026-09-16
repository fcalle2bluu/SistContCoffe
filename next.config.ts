import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Salida standalone: produce un servidor Node.js autocontenido en
  // .next/standalone, ideal para una imagen Docker liviana (ver Dockerfile).
  output: "standalone",
};

export default nextConfig;
