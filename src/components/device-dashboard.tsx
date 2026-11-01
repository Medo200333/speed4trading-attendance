import { Server, Users, Activity, Clock } from "lucide-react";
import { Badge, When, useCenter } from "./access-ui";

/** Professional per-branch device dashboard: online status, last sync, people & event counts. */
export function DeviceDashboard() {
  const { data, select, navigate } = useCenter();
  const today = new Date().toISOString().slice(0, 10);
  const groups = new Map<string, typeof data.devices>();
  for (const row of data.devices) {
    const key = row.location?.trim() || row.branchId || "بدون فرع";
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const people = (id: string) => data.people.filter((person) => person.deviceId === id).length;
  const events = (id: string) =>
    (data as { events?: { deviceId: string; time?: string }[] }).events?.filter(
      (event) => event.deviceId === id && String(event.time || "").startsWith(today),
    ).length;
  return (
    <div className="ac-branch-grid">
      {[...groups.entries()].map(([branch, devices]) => (
        <section key={branch} className="ac-branch">
          <header>
            <h3>{branch}</h3>
            <small>
              <bdi dir="ltr">
                {devices.filter((row) => row.status === "online").length}/{devices.length}
              </bdi>{" "}
              متصل
            </small>
          </header>
          {devices.map((row) => (
            <button
              key={row.id}
              type="button"
              className={`ac-device-card ${row.status}`}
              onClick={() => {
                select(row.id);
                navigate("devices");
              }}
            >
              <span className={`ac-dot ${row.status}`} aria-hidden="true" />
              <span className="ac-device-card-main">
                <strong>
                  <Server size={16} /> {row.name}
                </strong>
                <small>
                  {row.model || "لم تُقرأ الهوية بعد"} · <bdi dir="ltr">{row.host}</bdi>
                </small>
                <span className="ac-device-metrics">
                  <span title="الموظفون">
                    <Users size={14} /> <bdi dir="ltr">{people(row.id)}</bdi>
                  </span>
                  {events(row.id) !== undefined ? (
                    <span title="حدث اليوم">
                      <Activity size={14} /> <bdi dir="ltr">{events(row.id)}</bdi>
                    </span>
                  ) : null}
                  <span title="آخر سحب">
                    <Clock size={14} /> <When value={row.lastSync || row.sync.lastAttendanceSync || null} />
                  </span>
                </span>
                {row.error ? <small className="ac-message error">{row.error}</small> : null}
              </span>
              <Badge value={row.sync.running ? "جارٍ السحب…" : row.status} />
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}
