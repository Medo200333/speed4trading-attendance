const result = { at: new Date().toISOString() };
try {
  const root = await fetch("http://127.0.0.1:8080/", {
    signal: AbortSignal.timeout(5000),
  });
  const html = await root.text();
  result.http = root.status;
  result.dev =
    html.includes("/@vite/client") ||
    html.includes("virtual:tanstack-start-dev-client-entry");
  result.scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map(
    (m) => m[1],
  );
  if (result.dev) {
    const response = await fetch(
      "http://127.0.0.1:8080/src/components/access-pages.tsx",
      { signal: AbortSignal.timeout(5000) },
    );
    const module = await response.text();
    result.pullUI = {
      http: response.status,
      hasFailureDetails: module.includes("تفاصيل رفض AcsEvent"),
      hasDiagnostic: module.includes("sync.diagnose"),
    };
  }
} catch (e) {
  result.error = e.name;
}
console.log(JSON.stringify(result, null, 2));
