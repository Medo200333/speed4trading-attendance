import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Building2, Plus } from "lucide-react";
import { companyFn } from "@/lib/company.functions";
import type { Company } from "@/lib/access/company-domain";
import { useCenter, Button, Card, Field, Modal } from "./access-ui";
import { StepProgress } from "./access-brand";
export function CompaniesPage({
  onSelect,
}: {
  onSelect: (id: string) => void;
}) {
  const { data, refresh } = useCenter(),
    call = useServerFn(companyFn);
  const [editing, setEditing] = useState<Company | null | undefined>(),
    [branchCompany, setBranchCompany] = useState<Company>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [step, setStep] = useState(0),
    [saved, setSaved] = useState<Company>();
  const [profile, setProfile] = useState({
    nameAr: "",
    nameEn: "",
    address: "",
    contact: "",
    logo: "",
  });
  function open(company?: Company) {
    setEditing(company || null);
    setProfile({
      nameAr: company?.nameAr || "",
      nameEn: company?.nameEn || "",
      address: company?.address || "",
      contact: company?.contact || "",
      logo: company?.logo || "",
    });
    setStep(0);
    setError("");
    setSaved(undefined);
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      const result = await call({
        data: {
          action: "company.save",
          company: { ...profile, id: editing?.id },
        },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if ("company" in result.data && result.data.company) {
        setSaved(result.data.company);
        setStep(2);
        await refresh();
      }
    } catch {
      setError(
        "تعذر تأكيد الحفظ. أعد المحاولة من هذه الخطوة بعد مراجعة قائمة الشركات.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="ac-stack">
      <div className="ac-page-intro">
        <p>
          Speed for Training هو مالك البرنامج. كل شركة عميل لها بياناتها وأجهزتها وتقاريرها
          المستقلة.
        </p>
        <Button primary disabled={!data.systemAdmin} onClick={() => open()}>
          <Plus size={20} />
          إضافة شركة
        </Button>
      </div>
      <div className="ac-grid">
        {data.companies?.map((company) => (
          <Card key={company.id} title={company.nameAr}>
            <Building2 size={30} aria-hidden="true" />
            <p>{company.nameEn}</p>
            <p>{company.address || "لم يُحدد العنوان"}</p>
            <p className="ac-muted">{company.contact}</p>
            <div className="ac-actions">
              <Button primary onClick={() => onSelect(company.id)}>
                إدارة أجهزة هذه الشركة
              </Button>
              <Button
                disabled={
                  !(
                    data.systemAdmin ||
                    (data.actor.role === "admin" &&
                      data.companyId === company.id)
                  )
                }
                onClick={() => open(company)}
              >
                تعديل بيانات الشركة
              </Button>
              <Button
                disabled={
                  !(
                    data.systemAdmin ||
                    (data.actor.role === "admin" &&
                      data.companyId === company.id)
                  )
                }
                onClick={() => {
                  setBranchCompany(company);
                  setError("");
                }}
              >
                إضافة فرع
              </Button>
            </div>
            <div className="ac-list" style={{ marginTop: 16 }}>
              {company.branches.map((branch) => (
                <div className="ac-item" key={branch.id}>
                  <strong>{branch.name}</strong>
                  <p className="ac-muted">{branch.address}</p>
                </div>
              ))}
            </div>
            {!company.branches.length && (
              <p className="ac-muted">لا توجد فروع مسجلة بعد.</p>
            )}
          </Card>
        ))}
      </div>
      {editing !== undefined && (
        <Modal
          title={editing ? "تعديل شركة العميل" : "إضافة شركة عميل"}
          busy={busy}
          onClose={() => setEditing(undefined)}
        >
          <StepProgress
            current={step}
            steps={["بيانات الشركة", "مراجعة الحفظ", "النتيجة والخطوة التالية"]}
          />
          {error && (
            <p role="alert" className="ac-message error">
              {error}
            </p>
          )}
          {step === 0 ? (
            <form
              className="ac-stack"
              onSubmit={(e) => {
                e.preventDefault();
                setStep(1);
              }}
            >
              <Field
                label="اسم الشركة بالعربية"
                required
                maxLength={120}
                value={profile.nameAr}
                onChange={(e) => { const v = e.currentTarget.value; setProfile((p) => ({ ...p, nameAr: v })); }}
              />
              <Field
                label="اسم الشركة بالإنجليزية (اختياري)"
                maxLength={120}
                value={profile.nameEn}
                onChange={(e) => { const v = e.currentTarget.value; setProfile((p) => ({ ...p, nameEn: v })); }}
              />
              <Field
                label="عنوان الشركة"
                maxLength={300}
                value={profile.address}
                onChange={(e) => { const v = e.currentTarget.value; setProfile((p) => ({ ...p, address: v })); }}
              />
              <Field
                label="بيانات الاتصال"
                maxLength={160}
                value={profile.contact}
                onChange={(e) => { const v = e.currentTarget.value; setProfile((p) => ({ ...p, contact: v })); }}
              />
              <Field
                label="شعار العميل (اختياري)"
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  if (
                    !/^image\/(png|jpeg|webp)$/.test(f.type) ||
                    f.size > 300000
                  ) {
                    setError("اختر شعار PNG أو JPEG أو WebP حتى 300 كيلوبايت.");
                    return;
                  }
                  const r = new FileReader();
                  r.onload = () =>
                    setProfile((p) => ({ ...p, logo: String(r.result) }));
                  r.readAsDataURL(f);
                }}
              />
              {profile.logo && (
                <img
                  src={profile.logo}
                  alt="معاينة شعار العميل"
                  style={{ maxWidth: 180, maxHeight: 90, objectFit: "contain" }}
                />
              )}
              <p className="ac-muted">
                مثال لاسم عميل: شركة ماجفيجن. لا تستخدم اسم Speed for Training مكان اسم
                العميل.
              </p>
              <Button primary type="submit">
                التالي: مراجعة الشركة
              </Button>
            </form>
          ) : step === 1 ? (
            <div className="ac-stack">
              <h3>{profile.nameAr}</h3>
              <p>{profile.nameEn}</p>
              <p>{profile.address}</p>
              <p>
                سيُنشأ مخزن مستقل للشركة الجديدة. حفظ الشركة لا يتصل بأي جهاز
                بصمة.
              </p>
              <div className="ac-actions">
                <Button onClick={() => setStep(0)} disabled={busy}>
                  السابق
                </Button>
                <Button primary onClick={() => void save()} disabled={busy}>
                  {busy ? "جارٍ الحفظ…" : "حفظ شركة العميل"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="ac-stack">
              <p role="status" className="ac-message success">
                تم حفظ الشركة على الخادم.
              </p>
              <Button
                primary
                onClick={() => {
                  if (saved) {
                    setEditing(undefined);
                    setBranchCompany(saved);
                  }
                }}
              >
                إضافة أول فرع داخل هذه الشاشة
              </Button>
              <Button
                onClick={() => {
                  setEditing(undefined);
                  if (saved) onSelect(saved.id);
                }}
              >
                إدارة أجهزة الشركة
              </Button>
            </div>
          )}
        </Modal>
      )}
      {branchCompany && (
        <Modal
          title={`إضافة فرع — ${branchCompany.nameAr}`}
          busy={busy}
          onClose={() => setBranchCompany(undefined)}
        >
          {error && (
            <p role="alert" className="ac-message error">
              {error}
            </p>
          )}
          <form
            className="ac-stack"
            onSubmit={async (e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              try {
                const result = await call({
                  data: {
                    action: "branch.save",
                    companyId: branchCompany.id,
                    branch: {
                      name: String(form.get("name")),
                      address: String(form.get("address")),
                    },
                  },
                });
                if (result.ok) {
                  await refresh();
                  setBranchCompany(undefined);
                } else setError(result.error);
              } catch {
                setError("تعذر حفظ الفرع. احتفظ بمدخلاتك وأعد المحاولة.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field
              label="اسم الفرع"
              name="name"
              required
              maxLength={120}
              placeholder="مثال: الفرع الرئيسي"
            />
            <Field label="عنوان الفرع" name="address" maxLength={300} />
            <Button primary type="submit" disabled={busy}>
              حفظ الفرع والتحقق من ظهوره
            </Button>
          </form>
        </Modal>
      )}
    </div>
  );
}
