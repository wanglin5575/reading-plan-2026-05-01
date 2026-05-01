import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  env: {
    DATA_DIR: process.env.DATA_DIR ?? "/tmp",
  },
  // 父目录若另有 package-lock.json，Next 会误判 workspace 根，导致 Client Manifest 找不到本项目的 client 组件
  outputFileTracingRoot: __dirname,
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
