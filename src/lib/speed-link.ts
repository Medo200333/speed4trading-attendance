export type DeviceLink = { host: string; port: number; username: string; password: string };
export type LivePunch = { employeeNo: string; name: string; at: string; method: string };
export type LiveUser = { employeeNo: string; name: string; fingers: number; faces: number; cards: number };
export type ProbeResult = { ok: true; name: string; model: string; firmware: string; serial: string } | { ok: false; error: string };
export type PullResult = { ok: true; punches: LivePunch[]; users: LiveUser[]; device: { name: string; model: string; firmware: string; serial: string } } | { ok: false; error: string };
export type DoorResult = { ok: true } | { ok: false; error: string };

type SpeedBridge = {
  probe: (link: DeviceLink) => Promise<ProbeResult>;
  pull: (link: DeviceLink & { day: string }) => Promise<PullResult>;
  door: (link: DeviceLink & { cmd: "open" | "close" | "alwaysClose" }) => Promise<DoorResult>;
};

declare global {
  interface Window {
    speed?: SpeedBridge;
  }
}

export function speedApi() {
  return typeof window === "undefined" ? undefined : window.speed;
}

export const desktopOnly = "الفحص والسحب وأمر الباب بيشتغلوا من نسخة الويندوز على شبكة الفروع، مش من صفحة المعاينة.";
