// Used by staging now; ready to import in the live Vite config after restart approval.
export const privateFilesDeny = [".env", ".env.*", "**/*.{crt,pem}", "**/.git/**", "**/.skyline-private/**", "**/.codex-backups/**", "**/*.bak", "**/SKYLINE/access-control/**"];
export function privatePathGuard() {
  return {
    name: "skyline-private-path-guard",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        let path;
        try { path = decodeURIComponent((request.url || "").split("?")[0]).replaceAll("\\", "/").toLowerCase(); }
        catch { response.statusCode = 400; response.end("Invalid path"); return; }
        if (/(?:^|\/)(?:\.skyline-private|\.codex-backups|\.git)(?:\/|$)|\.bak(?:$|\/)|\/skyline\/access-control\//.test(path)) {
          response.statusCode = 403;
          response.end("Forbidden");
          return;
        }
        next();
      });
    },
  };
}
