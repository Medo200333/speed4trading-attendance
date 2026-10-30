export type DeviceLink = { host: string; port: number; username: string; password: string };
export type LivePunch = { employeeNo: string; name: string; at: string; method: string };
export type LiveUser = { employeeNo: string; name: string; fingers: number; faces: number; cards: number };
export type ProbeResult = { ok: true; name: string; model: string; firmware: string; serial: string } | { ok: false; error: string };
export type PullResult = { ok: true; punches: LivePunch[]; users: LiveUser[]; device: { name: string; model: string; firmware: string; serial: string } } | { ok: false; error: string };
export type DoorResult = { ok: true } | { ok: false; error: string };
export type CloudLoginResult =
  | { ok: true; apiBase: string; sessionId: string; featureCode: string; teamName: string; notice: string }
  | { ok: false; error: string; captcha?: string; featureCode?: string; needSms?: boolean };
export type CloudPunch = { employeeNo: string; name: string; date: string; time: string; method: string };
export type CloudPerson = { employeeNo: string; name: string; photo?: string };
export type CloudPullResult =
  | { ok: true; punches: CloudPunch[]; people: CloudPerson[]; notice?: string }
  | { ok: false; error: string };
export type TeamRow = { key: string; ar: string; en: string; meaning: string; found: boolean; path: string; count: number; names: string[] };
export type CloudMapResult = { ok: true; buttons: TeamRow[] } | { ok: false; error: string };

type SpeedBridge = {
  probe: (link: DeviceLink) => Promise<ProbeResult>;
  pull: (link: DeviceLink & { day: string }) => Promise<PullResult>;
  door: (link: DeviceLink & { cmd: "open" | "close" | "alwaysClose" }) => Promise<DoorResult>;
  cloudLogin: (input: { account: string; password: string; imageCode?: string; featureCode?: string; smsCode?: string }) => Promise<CloudLoginResult>;
  cloudMap: (input: { apiBase: string; sessionId: string }) => Promise<CloudMapResult>;
  cloudPull: (input: { apiBase: string; sessionId: string; featureCode: string; day: string }) => Promise<CloudPullResult>;
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
