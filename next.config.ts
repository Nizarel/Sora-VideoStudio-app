import type { NextConfig } from "next";
import path from "path";

// Use top-level outputFileTracingRoot (moved out of experimental in Next 15.5+)
const nextConfig: NextConfig = {
  devIndicators: false,
  output: "standalone",
  // Cast to any to avoid type mismatch if local @types lag behind Next release.
  // Accept outputFileTracingRoot without strict typing; local types may not include it yet.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ...( { outputFileTracingRoot: path.join(__dirname) } as any ),
};

export default nextConfig;
