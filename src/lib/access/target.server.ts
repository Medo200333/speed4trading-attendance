import { isIP } from "node:net";
const seed = () =>
  new Set(process.env.SKYLINE_EMPTY_INSTALL === "1" ? [] : ["192.168.1.21:80"]);
const registry = globalThis as typeof globalThis & {
  __skylineAllowedTargets?: Set<string>;
};
export function validateDeviceAddress(host: string, port: number) {
  if (isIP(host) !== 4 || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error(
      "عنوان الجهاز غير مسموح. استخدم IPv4 صريحاً وبورتاً صحيحاً.",
    );
  const [a, b] = host.split(".").map(Number);
  if (!(
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  ))
    throw new Error(
      "عنوان الجهاز غير مسموح. يلزم عنوان شبكة خاصة أو Tailscale.",
    );
}
export function allowDeviceTarget(host: string, port: number) {
  validateDeviceAddress(host, port);
  registry.__skylineAllowedTargets ??= seed();
  registry.__skylineAllowedTargets.add(`${host}:${port}`);
}
export function deviceBase(link: {
  host: string;
  port: number;
  https: boolean;
}) {
  const host = link.host.trim();
  validateDeviceAddress(host, link.port);
  registry.__skylineAllowedTargets ??= seed();
  const configured = (process.env.SKYLINE_ALLOWED_DEVICE_TARGETS || "").split(
    ",",
  );
  if (
    !registry.__skylineAllowedTargets.has(`${host}:${link.port}`) &&
    !configured.includes(`${host}:${link.port}`)
  )
    throw new Error(
      "الجهاز غير مسموح قبل إضافته إلى قائمة أجهزة البرنامج بواسطة المسؤول.",
    );
  return `${link.https ? "https" : "http"}://${host}:${link.port}`;
}
