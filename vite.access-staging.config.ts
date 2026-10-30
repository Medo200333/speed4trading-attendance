import base from "./vite.config";
// @ts-expect-error JS staging guard is tested through HTTP, separate from the live config.
import { privateFilesDeny, privatePathGuard } from "./scripts/access-security-config.mjs";
export default async function staging(environment: Parameters<typeof base>[0]) {
  const config = await base(environment);
  return { ...config, server: { ...config.server, host: "127.0.0.1", port: 8092, fs: { deny: privateFilesDeny } }, plugins: [privatePathGuard(), ...config.plugins] };
}
