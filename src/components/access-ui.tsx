import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  cloneElement,
  isValidElement,
  type ReactNode,
  type ReactElement,
} from "react";
import type { Snapshot } from "@/lib/access/service.server";
import type { ActionInput, QueryInput } from "@/lib/access/contracts";
import type { Device, Person, LogicalDoor, Feature } from "@/lib/access/domain";
import type { centerQueryFn, centerActionFn } from "@/lib/access.functions";
export type ActionData = Extract<
  Awaited<ReturnType<typeof centerActionFn>>,
  { ok: true }
>["data"];

export type QueryData = Extract<
  Awaited<ReturnType<typeof centerQueryFn>>,
  { ok: true }
>["data"];
export type ModalData = {
  kind:
    | "person"
    | "device"
    | "door"
    | "shift"
    | "holiday"
    | "leave"
    | "account"
    | "plan"
    | "import";
  person?: Person;
  device?: Device;
  door?: LogicalDoor;
};
export type CenterContextValue = {
  workActive: boolean;
  setWorkPending: (key: string, pending: boolean) => void;
  data: Snapshot;
  device?: Device;
  selected: string;
  employeeId: string;
  openEmployee: (personId: string) => void;
  select: (id: string) => void;
  busy: boolean;
  act: (input: ActionInput) => Promise<boolean>;
  read: (input: QueryInput, quiet?: boolean) => Promise<QueryData | undefined>;
  refresh: () => Promise<void>;
  modal: (data: ModalData) => void;
  tell: (text: string, error?: boolean) => void;
  navigate: (tab: string) => void;
  help: (topic?: string) => void;
  setup: (device?: Device) => void;
  run: (
    input: ActionInput,
    options?: { inline?: boolean; onError?: (message: string) => void },
  ) => Promise<ActionData | undefined>;
};
export const CenterContext = createContext<CenterContextValue | null>(null);
export const useCenter = () => {
  const context = useContext(CenterContext);
  if (!context) throw new Error("Center context missing");
  return context;
};
export const canOperate = (role: string) =>
  role === "admin" || role === "operator";
export function supported(device: Device | undefined, feature: Feature) {
  return (
    device?.capabilities.find((row) => row.feature === feature)?.state ===
    "supported"
  );
}
export function unavailable(device: Device | undefined, feature: Feature) {
  return (
    device?.capabilities.find((row) => row.feature === feature)?.reason ||
    "اختر جهازاً وافحص إمكانياته أولاً."
  );
}
export function Button({
  children,
  primary,
  danger,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  primary?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      {...props}
      className={`ac-button ${primary ? "primary" : ""} ${danger ? "danger" : ""} ${props.className || ""}`}
    >
      {children}
    </button>
  );
}
export function Badge({ value }: { value: string }) {
  const label: Record<string, string> = {
    supported: "مدعوم",
    unsupported: "غير مدعوم",
    unverified: "غير متحقق",
    unknown: "غير متحقق",
    online: "متصل",
    offline: "تعذر الاتصال",
    admin: "مسؤول",
    operator: "مشغّل",
    viewer: "مشاهد",
    accountant: "محاسبة",
    manager: "مدير",
  };
  return <span className={`ac-badge ${value}`}>{label[value] || value}</span>;
}
export function Field({
  label,
  wide,
  children,
  helpTopic,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  wide?: boolean;
  children?: ReactNode;
  helpTopic?: string;
}) {
  const context = useContext(CenterContext);
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        "aria-label": label,
      })
    : children || <input {...props} aria-label={label} />;
  return (
    <label className={`ac-field ${wide ? "wide" : ""}`}>
      <span className="ac-field-caption">
        {label}
        {helpTopic && context ? (
          <button
            className="ac-field-help"
            type="button"
            aria-label={`شرح ${label}`}
            onClick={(event) => {
              event.preventDefault();
              context.help(helpTopic);
            }}
          >
            ؟
          </button>
        ) : null}
      </span>
      {control}
    </label>
  );
}
export function Card({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="ac-card">
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="ac-empty">{children}</div>;
}
export function DevicePicker() {
  const { data, selected, select } = useCenter();
  return (
    <Field label="الجهاز">
      <select value={selected} onChange={(event) => select(event.target.value)}>
        {data.devices.map((device) => (
          <option key={device.id} value={device.id}>
            {device.name} · {device.host}{device.port && device.port !== 80 && device.port !== 443 ? `:${device.port}` : ""}
          </option>
        ))}
      </select>
    </Field>
  );
}
export function PersonPicker({
  value,
  onChange,
  deviceId,
}: {
  value: string;
  onChange: (value: string) => void;
  deviceId?: string;
}) {
  const { data } = useCenter();
  return (
    <Field label="الموظف">
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">اختر موظفاً</option>
        {data.people
          .filter((person) => !deviceId || person.deviceId === deviceId)
          .map((person) => (
            <option key={person.id} value={person.id}>
              {person.employeeNo} · {person.name}
            </option>
          ))}
      </select>
    </Field>
  );
}
export const dateToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Cairo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
/** Server stamps are UTC ("...Z"): show them in local time. Device times keep the offset the device wrote. */
export function whenText(value: string) {
  if (/Z$/i.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      const p = (n: number) => String(n).padStart(2, "0");
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    }
  }
  return value.replace("T", " ").slice(0, 19);
}
export function When({ value }: { value: string | null }) {
  return (
    <bdi dir="ltr">{value ? whenText(value) : "—"}</bdi>
  );
}
export function downloadFile(
  name: string,
  body: BlobPart | Uint8Array,
  type: string,
) {
  const content =
    body instanceof Uint8Array ? new Uint8Array(body).buffer : body;
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function TableScroll({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <>
      <p className="ac-table-hint ac-no-print">
        على الهاتف: مرّر الجدول أفقيًا لرؤية بقية الأعمدة.
      </p>
      <div
        className="ac-table-wrap"
        role="region"
        aria-label={label}
        tabIndex={0}
      >
        {children}
      </div>
    </>
  );
}
export function Modal({
  title,
  onClose,
  children,
  busy,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  busy: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLElement>("input,select,button")?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="ac-overlay"
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape" && !busy) onClose();
        if (event.key === "Tab") {
          const controls = Array.from(
            ref.current?.querySelectorAll<HTMLElement>(
              "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)",
            ) || [],
          );
          const visible = controls.filter(
            (control) => control.getClientRects().length > 0,
          );
          const first = visible[0],
            last = visible.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div
        ref={ref}
        className="ac-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>{title}</h2>
          <Button aria-label="إغلاق النافذة" disabled={busy} onClick={onClose}>
            ×
          </Button>
        </header>
        {children}
      </div>
    </div>
  );
}

const photoCache = new Map<string, Promise<string | null>>();
const importedPhotos = new Map<string, string>();
/** Register photos imported from the device so every avatar/report shows them at once. */
export function primePhotos(deviceId: string, photos: Record<string, string>) {
  for (const [no, photo] of Object.entries(photos)) importedPhotos.set(`${deviceId}|${no}`, photo);
  if (typeof window !== "undefined") window.dispatchEvent(new Event("ac-photos"));
}
/** Re-render when photos are imported. */
export function usePhotoVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const on = () => setV((x) => x + 1);
    window.addEventListener("ac-photos", on);
    return () => window.removeEventListener("ac-photos", on);
  }, []);
  return v;
}
/** Cached employee photo (data URL) from the device face library; null when none. */
export function personPhoto(
  read: ReturnType<typeof useCenter>["read"],
  person: { deviceId: string; employeeNo: string; faceCount?: number | null },
): Promise<string | null> {
  const known = importedPhotos.get(`${person.deviceId}|${person.employeeNo}`);
  if (known) return Promise.resolve(known);
  if (person.faceCount === 0) return Promise.resolve(null);
  const key = `${person.deviceId}|${person.employeeNo}|${person.faceCount ?? ""}`;
  if (!photoCache.has(key))
    photoCache.set(
      key,
      read({ action: "photo", deviceId: person.deviceId, employeeNo: person.employeeNo }, true).then(
        (r) => (r && "photo" in r ? (r.photo as string | null) : null),
      ),
    );
  return photoCache.get(key)!;
}
/** Employee photo from the device face library (cached by the server); falls back to the initial. */
export function PersonAvatar({
  person,
  size = 40,
}: {
  person: { deviceId: string; employeeNo: string; name: string; faceCount?: number | null };
  size?: number;
}) {
  const { read } = useCenter();
  const [src, setSrc] = useState<string | null>(null);
  const version = usePhotoVersion();
  const key = `${person.deviceId}|${person.employeeNo}|${person.faceCount ?? ""}`;
  useEffect(() => {
    let live = true;
    void personPhoto(read, person).then((v) => live && setSrc(v));
    return () => {
      live = false;
    };
  }, [key, version]);
  return src ? (
    <img className="ac-avatar ac-avatar-photo" src={src} alt={`صورة ${person.name}`} width={size} height={size} style={{ width: size, height: size, objectFit: "cover", borderRadius: "50%" }} />
  ) : (
    <span className="ac-avatar" style={{ width: size, height: size }}>{person.name.slice(0, 1)}</span>
  );
}

/** Progress bar for long operations. Without `max` it shows an indeterminate (moving) bar. */
export function ProgressBar({ value, max, label }: { value?: number; max?: number; label: string }) {
  const known = typeof value === "number" && typeof max === "number" && max > 0;
  const percent = known ? Math.min(100, Math.round((value! / max!) * 100)) : undefined;
  return (
    <div className="ac-progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <div className="ac-progress-track">
        <div className={`ac-progress-fill${known ? "" : " indeterminate"}`} style={known ? { width: `${percent}%` } : undefined} />
      </div>
      <small>
        {label}
        {known ? <> · <bdi dir="ltr">{percent}%</bdi></> : null}
      </small>
    </div>
  );
}
