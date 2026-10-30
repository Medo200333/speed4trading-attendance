export default function accessSecurity(
  event: { url: URL },
  next: () => unknown,
) {
  let path: string;
  try {
    path = decodeURIComponent(event.url.pathname)
      .replaceAll("\\", "/")
      .toLowerCase();
  } catch {
    return new Response("Invalid path", { status: 400 });
  }
  if (
    /(?:^|\/)(?:\.skyline-private|\.codex-backups|\.git)(?:\/|$)|\.bak(?:$|\/)|\/skyline\/access-control\//.test(
      path,
    )
  )
    return new Response("Forbidden", { status: 403 });
  return next();
}
