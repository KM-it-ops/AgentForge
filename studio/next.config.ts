import type { NextConfig } from "next";
import path from "node:path";

const repoIncludes = [
  path.join("..", "adapters", "**", "*"),
  path.join("..", "spec", "**", "*"),
  path.join("..", "bin", "**", "*"),
  path.join("..", "universal", "**", "*"),
];

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/compile": repoIncludes,
    "/api/doctor": repoIncludes,
    "/api/spec": [path.join("..", "spec", "**", "*")],
  },
};

export default nextConfig;
