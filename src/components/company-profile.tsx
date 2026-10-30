import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { companyProfileFn } from "@/lib/company-profile.functions";
import { EMPTY_PROFILE, type CompanyProfile } from "@/lib/company-profile";

let cached: CompanyProfile | null = null;
const listeners = new Set<(p: CompanyProfile) => void>();
/** Call after onboarding or a settings save so every header/report picks up the new identity. */
export function setCompanyProfile(p: CompanyProfile) { cached = p; listeners.forEach((l) => l(p)); }
export function currentCompanyProfile() { return cached || EMPTY_PROFILE; }
export function useCompanyProfile() {
  const read = useServerFn(companyProfileFn);
  const [p, setP] = useState<CompanyProfile>(cached || EMPTY_PROFILE);
  useEffect(() => {
    listeners.add(setP);
    if (!cached) read().then((r) => setCompanyProfile(r)).catch(() => undefined);
    return () => { listeners.delete(setP); };
  }, []);
  return p;
}
/** Secondary branding: customer company logo + name, always placed under the Speed frame. */
export function CompanyBadge({ profile }: { profile?: CompanyProfile }) {
  const live = useCompanyProfile(), p = profile || live;
  if (!p.name && !p.logo) return null;
  return (
    <div className="sp-customer" aria-label="الشركة">
      {p.logo ? <img src={p.logo} alt={`شعار ${p.name}`} /> : null}
      <div><small>الشركة</small><strong>{p.name}</strong></div>
    </div>
  );
}

/** Reads PNG/JPG/SVG (≤ 1MB), rasterises and resizes to ≤ 512px PNG. SVG is never stored as markup. */
export async function prepareLogo(file: File): Promise<string> {
  if (!/^image\/(png|jpeg|svg\+xml)$/.test(file.type) && !/\.(png|jpe?g|svg)$/i.test(file.name)) throw new Error("اختر صورة PNG أو JPG أو SVG.");
  if (file.size > 1024 * 1024) throw new Error("حجم الشعار أكبر من 1 ميجابايت.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const w0 = img.naturalWidth || 512, h0 = img.naturalHeight || 512, scale = Math.min(1, 512 / Math.max(w0, h0));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w0 * scale)); c.height = Math.max(1, Math.round(h0 * scale));
    const ctx = c.getContext("2d"); if (!ctx) throw new Error("تعذر تجهيز الشعار.");
    ctx.drawImage(img, 0, 0, c.width, c.height);
    let out = c.toDataURL("image/png");
    if (out.length > 1_350_000) out = c.toDataURL("image/jpeg", 0.9);
    return out;
  } catch (e) {
    throw e instanceof Error && /PNG|ميجابايت|الشعار/.test(e.message) ? e : new Error("تعذر قراءة الصورة. جرّب ملفاً آخر.");
  } finally { URL.revokeObjectURL(url); }
}
export function LogoPicker({ value, onChange, onError }: { value: string; onChange: (v: string) => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="ac-field sp-logo-picker">
      <span>شعار الشركة (PNG أو JPG أو SVG حتى 1 ميجابايت)</span>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div className="sp-tile" style={{ width: 96, height: 96, display: "grid", placeItems: "center", border: "1px dashed #bcc4c8", borderRadius: 16, background: "#f7fafb" }}>
          {value ? <img src={value} alt="معاينة شعار الشركة" style={{ maxWidth: 84, maxHeight: 84, objectFit: "contain" }} /> : <small style={{ color: "#64748b" }}>{busy ? "جارٍ التجهيز…" : "بدون شعار"}</small>}
        </div>
        <label className="ac-button" style={{ cursor: "pointer", position: "relative" }}>{value ? "تغيير الشعار" : "اختيار شعار"}
        <input type="file" aria-label="اختيار شعار الشركة" accept="image/png,image/jpeg,image/svg+xml,.svg" disabled={busy} onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
          setBusy(true);
          try { onChange(await prepareLogo(f)); onError(""); } catch (err) { onError((err as Error).message); } finally { setBusy(false); }
        }} /></label>
        {value ? <button type="button" className="ac-button" onClick={() => onChange("")}>إزالة</button> : null}
      </div>
    </div>
  );
}
