import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";
import { useEffect } from "react";

/** Marks client hydration so the inline no-hydration fallback (stale assets, dead server) stays hidden. */
function HydrationMark() {
  useEffect(() => { (window as unknown as { __speedHydrated?: boolean }).__speedHydrated = true; document.getElementById("speed-nohydrate")?.remove(); }, []);
  return null;
}

import {BRAND} from "@/lib/brand";
const APP_NAME = BRAND.name;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      {
        name: "description",
        content:
          "إدارة أجهزة Hikvision والموظفين وبصمة الوجه والأبواب والحضور والانصراف.",
      },
      { name: "theme-color", content: "#123462" },
      { name: "apple-mobile-web-app-title", content: APP_NAME },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/app-icon.png" },
    ],
  }),
  component: () => (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <HydrationMark />
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <script dangerouslySetInnerHTML={{ __html: `setTimeout(function(){if(window.__speedHydrated)return;var d=document.createElement('div');d.id='speed-nohydrate';d.dir='rtl';d.setAttribute('role','alert');d.style.cssText='position:fixed;inset:auto 12px 12px 12px;z-index:99999;background:#0B2242;color:#F8F5EC;border:1px solid #D6B25E;border-radius:12px;padding:14px;font:15px "IBM Plex Sans Arabic",Tahoma,sans-serif;text-align:center';d.innerHTML='تعذر تحميل التطبيق من الخادم. <button style="margin-inline-start:8px;background:#D6B25E;color:#0B2242;border:0;border-radius:8px;padding:8px 14px;font:inherit;font-weight:600">إعادة المحاولة</button>';d.querySelector('button').onclick=function(){location.reload()};document.body.appendChild(d)},45000)` }} />
        <Scripts />
      </body>
    </html>
  ),
});
