// Browser-safe Hik-Connect Team constants and types (no node:crypto).
/** Server addresses from the guide, chapter 2 "Getting Started". */
export const HC_REGIONS = [
  { id: "isgp", label: "Singapore / الشرق الأوسط وآسيا", url: "https://isgp-team.hikcentralconnect.com" },
  { id: "ieu", label: "Europe / أوروبا", url: "https://ieu-team.hikcentralconnect.com" },
  { id: "isa", label: "South America / أمريكا الجنوبية", url: "https://isa-team.hikcentralconnect.com" },
  { id: "ius", label: "North America / أمريكا الشمالية", url: "https://ius-team.hikcentralconnect.com" },
  { id: "iind", label: "India / الهند", url: "https://iind-team.hikcentralconnect.com" },
  { id: "ru", label: "Russia / روسيا", url: "https://team.hikcentralconnectru.com" },
] as const;
export type HcRegion = (typeof HC_REGIONS)[number]["id"];
export const regionUrl = (id: string) => HC_REGIONS.find((r) => r.id === id)?.url ?? "";

/** How the Hik-Connect Team page connects: the website login (phone/email + password) or the official OpenAPI (AK/SK). */
export type HcMethod = "phone" | "openapi";
export type HcStored = { appKey: string; region: string; secretEnc: string; savedAt: string; method?: HcMethod; token?: { enc: string; expiresAt: number; areaDomain: string } };
export type HcPublic = { configured: boolean; appKey: string; region: string; hasSecret: boolean; savedAt: string; tokenValidUntil: string; method: HcMethod };
/** OpenAPI eventType for a successful authentication; every other type is shown as «محاولة غير ناجحة». */
export const HC_OK_EVENT = 110013;
export const HC_FAILED_LABEL = "محاولة غير ناجحة";

