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

export type HcStored = { appKey: string; region: string; secretEnc: string; savedAt: string; token?: { enc: string; expiresAt: number; areaDomain: string } };
export type HcPublic = { configured: boolean; appKey: string; region: string; hasSecret: boolean; savedAt: string; tokenValidUntil: string };

