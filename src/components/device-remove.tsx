import { useState } from "react";
import { Button, Modal, useCenter } from "./access-ui";
import type { RemovalImpact } from "@/lib/access/device-remove-core";

/** Admin-only: removes a device from the app (never writes to the physical device). */
export function RemoveDeviceButton({ deviceId }: { deviceId: string }) {
  const { data, busy, run } = useCenter();
  const [impact, setImpact] = useState<RemovalImpact | null>(null);
  const [removeEvents, setRemoveEvents] = useState(false);
  const [removeEmployees, setRemoveEmployees] = useState(false);
  if (data.actor.role !== "admin") return null;
  const open = async () => {
    const r = await run({ action: "device.remove", deviceId, dryRun: true, removeEvents: false, removeEmployees: false });
    if (r?.removal) { setRemoveEvents(false); setRemoveEmployees(false); setImpact(r.removal); }
  };
  const confirm = async () => {
    if (!impact) return;
    const r = await run({ action: "device.remove", deviceId: impact.deviceId, dryRun: false, removeEvents, removeEmployees });
    if (r) setImpact(null);
  };
  return (
    <>
      <Button disabled={busy} onClick={open}>حذف الجهاز من البرنامج</Button>
      {impact && (
        <Modal title="حذف الجهاز من البرنامج" busy={busy} onClose={() => setImpact(null)}>
          <div className="ac-stack" data-testid="device-remove-dialog">
            <p>
              الجهاز: <strong>{impact.name}</strong> — <bdi>{impact.host}:{impact.port}</bdi>
            </p>
            <ul>
              <li>سجلات الحضور المرتبطة: {impact.events}</li>
              <li>الموظفون على هذا الجهاز: {impact.employees} (منهم {impact.deviceOnlyEmployees} على هذا الجهاز فقط، و{impact.sharedEmployees} موجودون على أجهزة أخرى)</li>
            </ul>
            <p className="ac-muted">الحذف من البرنامج فقط؛ لن يُرسل أي أمر للجهاز نفسه. بيانات الدخول المحفوظة للجهاز ستُحذف.</p>
            <label><input type="checkbox" checked={removeEvents} onChange={(e) => setRemoveEvents(e.target.checked)} /> احذف سجلات الحضور الخاصة بالجهاز أيضاً (الافتراضي: الاحتفاظ بالتاريخ)</label>
            <label><input type="checkbox" checked={removeEmployees} onChange={(e) => setRemoveEmployees(e.target.checked)} /> احذف موظفي هذا الجهاز من البرنامج أيضاً</label>
            <div className="ac-actions">
              <Button disabled={busy} onClick={() => setImpact(null)}>إلغاء</Button>
              <Button primary disabled={busy} onClick={confirm}>تأكيد الحذف من البرنامج</Button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
