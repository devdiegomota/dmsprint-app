import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* Pacotes nativos (super-resolução ESRGAN) precisam ficar fora do bundle
     e ser copiados intactos para o standalone (.node/.so do onnxruntime). */
  serverExternalPackages: ["onnxruntime-node", "sharp"],
  outputFileTracingIncludes: {
    "/api/enhance-ai": [
      "./node_modules/onnxruntime-node/**",
      "./node_modules/onnxruntime-common/**",
    ],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
};

export default nextConfig;
