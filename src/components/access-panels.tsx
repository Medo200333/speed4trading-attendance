import { Plus } from "lucide-react";
import { AttendanceBoard } from "./attendance-board";
import {
  AttendancePanel,
  EventsPanel,
  CredentialsPanel,
  PermissionsPanel,
  AuditPanel,
} from "./access-workflows";
import {
  HomePage,
  DevicesPage,
  EmployeesPage,
  ReportsPage,
  SettingsPage,
  CapabilitiesPage,
} from "./access-pages";
import { OperatingGuide } from "./access-guide";
import { PictureGuide } from "./picture-guide";
import {
  useCenter,
  Button,
  Badge,
  Card,
  Empty,
  DevicePicker,
  supported,
  unavailable,
  canOperate,
} from "./access-ui";
export function AccessPanels({
  tab,
  guideTopic,
}: {
  tab: string;
  guideTopic?: string;
}) {
  const {data}=useCenter();
  if (tab === "dashboard") return <HomePage />;
  if (tab === "people") return <EmployeesPage />;
  if (tab === "devices") return <DevicesPage />;
  if (tab === "teams") return <TeamsPage />;
  if (tab === "doors") return data.deviceWrites === true && data.actor.role !== "accountant" ? <Doors /> : <HomePage />;
  if (tab === "attendance") return <AttendancePanel />;
  if (tab === "reports") return <ReportsPage />;
  if (tab === "guide")
    return <><PictureGuide /><OperatingGuide key={guideTopic} initialTopic={guideTopic} /></>;
  if (tab === "advanced") return <CapabilitiesPage />;
  if (tab === "events") return <EventsPanel />;
  if (tab === "credentials") return <CredentialsPanel />;
  if (tab === "permissions") return <PermissionsPanel />;
  if (tab === "settings") return <SettingsPage />;
  if (tab === "audit") return <AuditPanel />;
  if (!data.systemAdmin) return <Empty>تكامل Hik-Connect الحالي يديره مسؤول نظام speed4trading في مساره المستقل. أجهزة شركتك المحلية متاحة في صفحة الأجهزة؛ حساب السحابة لا يحل محل اعتماد ISAPI.</Empty>;
  return (
    <Card title="Hik-Connect والاستيراد اليدوي">
      <p className="ac-muted">
        حساب السحابة مستقل عن حساب جهاز ISAPI. استخدم طرق الدخول والاستيراد
        الحالية هنا.
      </p>
      <AttendanceBoard embedded />
    </Card>
  );
}
function Doors() {
  const { data, device, selected, busy, act, modal } = useCenter();
  const operator = canOperate(data.actor.role),
    admin = data.actor.role === "admin";
  const doors = data.doors.filter((door) => door.deviceId === selected);
  const status = (channel: number) => {
    const probe = device?.probes.find(
      (probe) =>
        probe.endpoint === "/ISAPI/AccessControl/AcsWorkStatus?format=json",
    );
    const value = Object.entries(probe?.fields || {}).find(([key]) =>
      key.endsWith(`.doorStatus.${channel - 1}`),
    )?.[1];
    return (
      (
        {
          1: "وضع السكون",
          2: "إبقاء مفتوح",
          3: "إبقاء مغلق",
          4: "وضع متحكّم به",
        } as Record<string, string>
      )[String(value)] || "لم تُثبت حالة الباب"
    );
  };
  return (
    <div className="ac-stack">
      <div className="ac-toolbar">
        <DevicePicker />
        <Button
          primary
          disabled={
            busy ||
            !operator ||
            !device?.physicalDoorIds.length ||
            !supported(device, "doors")
          }
          onClick={() => modal({ kind: "door" })}
        >
          <Plus size={17} />
          إضافة باب
        </Button>
      </div>
      <p className="ac-message">
        إضافة باب هنا تعرّف اسماً وموقعاً لقناة مثبتة في الجهاز. لا تنشئ قناة
        عتاد جديدة ولا تفتح الباب.
      </p>
      {!device?.physicalDoorIds.length ? (
        <Empty>
          لم تثبت قراءة الجهاز أي قناة باب فعلية حتى الآن. التحكم اليدوي وتعريف
          الأبواب متوقفان لحين إثبات القنوات.
        </Empty>
      ) : (
        <Card title="القنوات الفعلية المقروءة">
          <div className="ac-actions">
            {device.physicalDoorIds.map((channel) => (
              <Badge key={channel} value={`قناة ${channel}`} />
            ))}
          </div>
        </Card>
      )}
      {doors.map((door) => (
        <Card key={door.id} title={door.name}>
          <div className="ac-toolbar">
            <p className="ac-muted">
              القناة {door.channel} · {door.location || "لم يُحدد الموقع"}
            </p>
            <Badge value={status(door.channel)} />
          </div>
          <p>{door.notes}</p>
          <div className="ac-actions">
            <Button
              disabled={busy || !operator}
              onClick={() => modal({ kind: "door", door })}
            >
              تعديل التعريف المحلي
            </Button>
            {(
              [
                ["open", "فتح لحظي"],
                ["close", "إغلاق"],
                ["alwaysOpen", "إبقاء مفتوحاً"],
                ["alwaysClose", "إبقاء مغلقاً"],
              ] as const
            ).map(([command, label]) => (
              <Button
                key={command}
                danger={command.startsWith("always")}
                disabled={
                  busy ||
                  !admin ||
                  !supported(device, "door.control") ||
                  !device?.doorCommands.includes(command)
                }
                title={unavailable(device, "door.control")}
                onClick={() =>
                  device &&
                  act({
                    action: "prepare",
                    operation: {
                      kind: "door",
                      deviceId: device.id,
                      doorNo: door.channel,
                      command,
                    },
                  })
                }
              >
                {label}
              </Button>
            ))}
          </div>
          <p className="ac-muted">
            أي أمر فعلي يمر بمعاينة وتأكيد مكتوب. قبول الجهاز للأمر لا يثبت حركة
            القفل الميكانيكية.
          </p>
        </Card>
      ))}
    </div>
  );
}

/** Hik-Connect Team lives on its own page: cloud login, pull, and Team reports only — no device/Tailscale calls. */
function TeamsPage() {
  return (
    <div className="ac-teams-page">
      <Card title="Hik-Connect Team">
        <p className="ac-muted">
          السحب هنا من موقع Hik-Connect Team مباشرة على الإنترنت، ومش محتاج Tailscale ولا إن أجهزة الفروع تكون شغالة.
          ادخل بحساب الموقع، اختار الفترة، واسحب البصمات والتقارير (Excel و PDF بالصور).
        </p>
      </Card>
      <AttendanceBoard embedded teamsOnly />
    </div>
  );
}
