import { useState } from "react";
import type { Device } from "@/lib/access/domain";
import { useCenter, Button, Field, Modal } from "./access-ui";
/** Re-authentication in the current workflow; no navigation and no disk/browser credential cache. */
export function InlineDeviceConnection({
  device,
  onClose,
  onConnected,
}: {
  device: Device;
  onClose: () => void;
  onConnected?: () => Promise<void> | void;
}) {
  const { run, busy } = useCenter();
  const [username, setUsername] = useState("admin"),
    [password, setPassword] = useState(""),
    [error, setError] = useState("");
  return (
    <Modal
      title={`إعادة الاتصال — ${device.name}`}
      busy={busy}
      onClose={() => {
        setPassword("");
        onClose();
      }}
    >
      <p>
        ستبقى خطواتك والصورة المفتوحة في مكانها. نختبر اعتماد الجهاز بقراءة
        الهوية والقدرات فقط.
      </p>
      <p>
        <bdi>
          {device.host}:{device.port}
        </bdi>{" "}
        · {device.model || "لم يقرأ الموديل بعد"}
      </p>
      {error && (
        <p className="ac-message error" role="alert">
          {error}
        </p>
      )}
      <form
        className="ac-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setError("");
          const result = await run(
            { action: "connect", deviceId: device.id, username, password },
            { inline: true, onError: setError },
          );
          if (result) {
            setPassword("");
            await onConnected?.();
            onClose();
          }
        }}
      >
        <Field
          label="اسم مستخدم البصمة"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
          autoComplete="off"
          dir="ltr"
        />
        <Field
          label="كلمة مرور البصمة"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          dir="ltr"
        />
        <Button primary type="submit" disabled={busy}>
          {busy ? "جارٍ التحقق…" : "اختبار الاتصال والعودة إلى العملية"}
        </Button>
      </form>
    </Modal>
  );
}
