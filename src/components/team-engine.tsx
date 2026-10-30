import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { hikMapFn } from "@/lib/hikvision.functions";
import { hikPeopleSchemaFn } from "@/lib/hikvision.functions";
import { TeamConfiguration } from "@/components/team-configuration";
import { ConfigurationStudio } from "@/components/configuration-studio";

type ButtonRow = {
  key: string;
  ar: string;
  en: string;
  meaning: string;
  found: boolean;
  path: string;
  count: number;
  names: string[];
  diagnostics?: {
    path: string;
    http: number;
    recognized: boolean;
    nameCount: number;
  }[];
};

type SavedMap = { stamp: string; buttons: ButtonRow[] };

const MEMORY = "awwal-team-map";

export function TeamEngine({ apiBase, sessionId }: { apiBase: string; sessionId: string }) {
  const readMap = useServerFn(hikMapFn);
  const inspectPeople = useServerFn(hikPeopleSchemaFn);
  const [schemaBusy, setSchemaBusy] = useState(false);
  const [schemaResult, setSchemaResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [buttons, setButtons] = useState<ButtonRow[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(MEMORY);
      if (!raw) return;
      const saved = JSON.parse(raw) as SavedMap;
      if (!Array.isArray(saved.buttons)) return;
      saved.buttons = saved.buttons.map((button) => ({
        ...button,
        names: [],
      }));
      localStorage.setItem(MEMORY, JSON.stringify(saved));
    } catch {
      // Retain existing application behavior.
    }
  }, []);

  async function readTeam() {
    setBusy(true);
    setError("");
    setNote("");
    try {
      const result = await readMap({ data: { apiBase, sessionId } });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const safeButtons: ButtonRow[] = result.buttons.map(
        (button) => ({ ...button, names: [] })
      );
      const previous = load();
      const lines: string[] = [];
      if (!previous) lines.push("أول قراءة. اتحفظت كآخر صورة للتيم.");
      else {
        for (const button of result.buttons) {
          const old = previous.buttons.find((item) => item.key === button.key);
          if (old?.found && !button.found) lines.push(`${button.ar}: الزرار القديم اختفى، والمسارات البديلة ما لقتهوش.`);
          else if (old?.path && button.path && old.path !== button.path) lines.push(`${button.ar}: المكان اتغير، والبرنامج لقى المسار الجديد.`);
          else if (old && (old.count !== button.count || old.found !== button.found)) lines.push(`${button.ar}: البيانات اتغيرت من آخر قراءة.`);
        }
        if (!lines.length) lines.push("نفس آخر قراءة. مفيش تحديث على البيانات.");
      }
      localStorage.setItem(MEMORY, JSON.stringify({ stamp: result.stamp, buttons: safeButtons } satisfies SavedMap));
      setButtons(safeButtons);
      setNote(lines.join(" "));
    } catch {
      setError("القراءة انقطعت. ادخل على الموقع تاني.");
    } finally {
      setBusy(false);
    }
  }

  async function inspectPeopleOnClick() {
    setSchemaBusy(true);
    setSchemaResult("");
    try {
      const result = await inspectPeople({ data: { apiBase, sessionId } });
      setSchemaResult(JSON.stringify(result, null, 2));
    } catch {
      setSchemaResult("تعذر فحص البنية. لم تُعرض بيانات شخصية.");
    } finally {
      setSchemaBusy(false);
    }
  }

  function download() {
    const body = buttons
      .map(
        (button) =>
          `<h2>${button.ar} — ${button.en}</h2><p>${button.meaning}</p><p>${button.found ? `قراءة متاحة. عينة أسماء: ${button.count}.` : "مش ظاهر في المسارات المعروفة."}</p><p>${button.names.join(" · ")}</p>`,
      )
      .join("");
    const html = `<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>قراءة التيم</title><body style="font-family:sans-serif;max-width:800px;margin:auto;padding:24px"><h1>ترجمة قراءة هيك-كونكت تيم</h1>${body}</body></html>`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    link.download = "قراءة-التيم.html";
    link.click();
  }

  return (
    <div className="mt-3 flex flex-col gap-3">
      <button
        type="button"
        onClick={() => void readTeam()}
        disabled={busy}
        className="h-11 rounded-md border border-brass px-4 text-sm font-medium text-brass disabled:opacity-50"
      >
        {busy ? "بيقرأ التيم…" : "اقرأ التيم"}
      </button>
      {error ? <p className="text-sm text-clay">{error}</p> : null}
      {note ? <p className="text-sm leading-7 text-ink">{note}</p> : null}
        <section className="rounded-md border border-line p-3">
          <button type="button" disabled={schemaBusy || busy}
            onClick={() => void inspectPeopleOnClick()}
            className="rounded-md border border-brass px-3 py-2 text-sm disabled:opacity-50">
            {schemaBusy ? "جاري فحص البنية…" : "فحص بنية الأشخاص — قراءة فقط"}
          </button>
          {schemaResult ? <pre dir="ltr" className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">{schemaResult}</pre> : null}
        </section>
      <ConfigurationStudio apiBase={apiBase} sessionId={sessionId} />
      <TeamConfiguration buttons={buttons} />
      {buttons.length ? (
        <>
          <ul className="flex flex-col gap-2">
            {buttons.map((button) => (
              <li key={button.key} className="rounded-md border border-line px-3 py-2 text-sm leading-7">
                <strong>{button.ar}</strong>
                <span className="text-muted"> · {button.en}</span>
                <span className={button.found ? "text-brass" : "text-clay"}>{button.found ? ` · عينة أسماء (${button.count})` : " · مش ظاهر"}</span>
                <span className="mt-1 block text-ink">{button.meaning}</span>
                {button.names.length ? <span className="mt-1 block text-muted" dir="ltr">{button.names.slice(0, 8).join(" · ")}</span> : null}
                        {button.diagnostics?.length ? (
                          <div className="mt-2 space-y-1 text-xs text-muted" dir="ltr">
                            {button.diagnostics.map((probe) => (
                              <p key={probe.path}>
                                {probe.path} | HTTP {probe.http} |
                                {probe.recognized
                                  ? ` READ_OK: ${probe.nameCount} names`
                                  : " UNCONFIRMED"}
                              </p>
                            ))}
                          </div>
                        ) : null}
              </li>
            ))}
          </ul>
          <button type="button" onClick={download} className="h-11 rounded-md border border-line px-4 text-sm">
            تصدير الترجمة
          </button>
        </>
      ) : null}
    </div>
  );
}

function load(): SavedMap | null {
  try {
    const raw = localStorage.getItem(MEMORY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedMap;
    if (!Array.isArray(parsed.buttons)) return null;
    return parsed;
  } catch {
    return null;
  }
}
