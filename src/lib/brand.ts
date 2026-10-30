import configuration from "../../brand.config.json";
/** Owner identity only. Customer names, tenant IDs, accounts and devices are independent. */
export const BRAND = {
  ...configuration,
  logoSrc: configuration.logoSrc as string | null,
  color: configuration.palette.navy,
  exportPrefix: "Speed",
};
export const brandTheme = {
  "--ac-blue": BRAND.palette.primary,
  "--ac-navy": BRAND.palette.navy,
  "--ac-bg": BRAND.palette.background,
  "--ac-panel": BRAND.palette.surface,
  "--ac-ink": BRAND.palette.text,
  "--ac-muted": BRAND.palette.muted,
  "--ac-line": BRAND.palette.border,
  fontFamily: BRAND.fontFamily,
};
