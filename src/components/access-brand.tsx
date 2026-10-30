import { BRAND } from "@/lib/brand";
import { CompanyBadge } from "./company-profile";
import type { CompanyProfile } from "@/lib/company-profile";

/** Speed frame (primary brand) with the customer company underneath as secondary branding. */
export function Brand({ compact = false, subtitle, company = true, profile }: { compact?: boolean; subtitle?: string; company?: boolean; profile?: CompanyProfile }) {
  return (
    <div className={`ac-identity sp-identity ${compact ? "compact" : ""}`}>
      <div className="sp-lockup">
        {BRAND.logoSrc && <div className="sp-tile"><img className="ac-official-logo" src={BRAND.logoSrc} alt={`شعار ${BRAND.name}`} /></div>}
        <div>
          <strong className="sp-title ac-brand" dir="ltr">{BRAND.name}</strong>
          {!compact && <p>{subtitle || BRAND.description}</p>}
        </div>
      </div>
      {company ? <CompanyBadge profile={profile} /> : null}
    </div>
  );
}

export function StepProgress({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <div className="ac-wizard-progress" aria-label="خطوات التسجيل">
      <p aria-live="polite">
        <span>
          الخطوة {current + 1} من {steps.length}
        </span>
        <strong>{steps[current]}</strong>
      </p>
      <ol>
        {steps.map((label, index) => (
          <li
            key={label}
            aria-current={current === index ? "step" : undefined}
            className={index < current ? "complete" : ""}
          >
            <span aria-hidden="true">{index + 1}</span>
            <span>{label}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
