/** Pure helpers for Tailscale linking. The app stores no Tailscale identity. */

export const TAILSCALE_PAGES = {
  login: "https://login.tailscale.com/login",
  machines: "https://login.tailscale.com/admin/machines",
} as const;
export type TailscalePage = keyof typeof TAILSCALE_PAGES;

export function isPublicTailscaleUrl(url: string) {
  return (Object.values(TAILSCALE_PAGES) as string[]).includes(url);
}

/** Public site pages, plus the one-time device auth URL printed by `tailscale login`. */
export function isTailscaleAuthUrl(url: string) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === "login.tailscale.com" && (u.pathname === "/login" || u.pathname === "/admin/machines" || u.pathname.startsWith("/a/"));
  } catch { return false; }
}

export function pickPrivateBrowser(env: Record<string, string | undefined>, exists: (path: string) => boolean, url: string, profileDir: string) {
  if (!isTailscaleAuthUrl(url)) return null;
  const roots = [env.ProgramFiles || "C:\\Program Files", env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", env.LOCALAPPDATA || ""].filter(Boolean);
  const fresh = ["--no-first-run", "--no-default-browser-check", `--user-data-dir=${profileDir}`];
  const options: [string, string, string[]][] = [
    ["edge", "Microsoft\\Edge\\Application\\msedge.exe", ["--inprivate", ...fresh, "--disable-features=msImplicitSignin,msEdgeAutoSignIn", "--new-window"]],
    ["chrome", "Google\\Chrome\\Application\\chrome.exe", ["--incognito", ...fresh, "--new-window"]],
    ["firefox", "Mozilla Firefox\\firefox.exe", ["-no-remote", "-profile", profileDir, "-private-window"]],
  ];
  for (const [name, rel, flags] of options)
    for (const base of roots) {
      const exe = `${base}\\${rel}`;
      if (exists(exe)) return { browser: name, exe, args: [...flags, url] };
    }
  return null;
}

export function isDeviceAddress(host: string) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host || "");
  if (!m) return false;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return false;
  const [a, b] = o;
  if (a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) return true;
  return a === 100 && b >= 64 && b <= 127;
}

export function parseBranchTarget(text: string): { host: string; port: number } | null {
  const m = /^\s*(\d{1,3}(?:\.\d{1,3}){3})(?:\/32)?(?::(\d{1,5}))?\s*$/.exec(text || "");
  if (!m || !isDeviceAddress(m[1])) return null;
  const port = m[2] ? Number(m[2]) : 80;
  return port >= 1 && port <= 65535 ? { host: m[1], port } : null;
}

export const AUTH_URL = /https:\/\/login\.tailscale\.com\/a\/[A-Za-z0-9_-]+/;

export type RoutePeer = { HostName?: string; DNSName?: string; Online?: boolean; OS?: string; PrimaryRoutes?: string[]; AllowedIPs?: string[] };
export type RouteDevice = { name: string; ip: string; os: string; online: boolean };

function lanRoute(cidr: string) {
  const m = /^(\d{1,3}(?:\.\d{1,3}){3})\/32$/.exec((cidr || "").trim());
  if (!m || !isDeviceAddress(m[1])) return "";
  const [a, b] = m[1].split(".").map(Number);
  if (a === 100 && b >= 64 && b <= 127) return "";
  return m[1];
}

/** Online machines only, and only the fingerprint address behind each one. Never the computer's 100.x address. */
export function fingerprintRoutes(peers: Record<string, RoutePeer> | undefined): RouteDevice[] {
  const rows: RouteDevice[] = [];
  for (const p of Object.values(peers || {})) {
    if (!p.Online) continue;
    const name = p.HostName || (p.DNSName || "").replace(/\.$/, "") || "جهاز";
    const seen = new Set<string>();
    for (const cidr of [...(p.PrimaryRoutes || []), ...(p.AllowedIPs || [])]) {
      const ip = lanRoute(cidr);
      if (!ip || seen.has(ip)) continue;
      seen.add(ip);
      rows.push({ name, ip, os: p.OS || "", online: true });
    }
  }
  return rows.sort((a, b) => a.name.localeCompare(b.name));
}
