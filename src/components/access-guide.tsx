import { useMemo, useState } from "react";
import { BookOpen, ChevronLeft, Search, CheckCircle2 } from "lucide-react";
import { guideTopics, type GuideAction } from "@/lib/access/guide";
import {BRAND} from "@/lib/brand";
import {
  Button,
  Card,
  Field,
  canOperate,
  supported,
  useCenter,
} from "./access-ui";
export function OperatingGuide({
  initialTopic = "start",
}: {
  initialTopic?: string;
}) {
  const { data, device, navigate, modal, setup, act, tell } = useCenter();
  const [topicId, setTopicId] = useState(initialTopic),
    [step, setStep] = useState(0),
    [search, setSearch] = useState("");
  const topic =
    guideTopics.find((topic) => topic.id === topicId) || guideTopics[0];
  const results = useMemo(
    () =>
      guideTopics.filter((topic) =>
        `${topic.title} ${topic.intro} ${topic.steps.map((step) => step.text).join(" ")}`.includes(
          search.trim(),
        ),
      ),
    [search],
  );
  const current = topic.steps[step] || topic.steps[0];
  const labels: Record<GuideAction, string> = {
    setup: "ابدأ إضافة جهاز",
    test: "جرب الاتصال — قراءة فقط",
    person: "افتح إضافة موظف",
    door: "افتح إضافة باب",
    readUsers: "اقرأ الموظفين الآن",
    sync: "افتح السحب وحدد الفترة",
    shift: "افتح إضافة وردية",
  };
  function available(action: GuideAction) {
    if (action === "setup") return data.actor.role === "admin";
    if (action === "person")
      return data.actor.role === "admin" && supported(device, "users.add");
    if (action === "door")
      return (
        canOperate(data.actor.role) && Boolean(device?.physicalDoorIds.length)
      );
    return canOperate(data.actor.role);
  }
  async function runAction(action: GuideAction) {
    if (!available(action)) return;
    if (action === "setup") setup();
    else if (action === "test") {
      navigate("devices");
      if (device) await act({ action: "probe", deviceId: device.id });
      else tell("أضف عنوان الجهاز وأدخل بياناته أولاً.", true);
    } else if (action === "person" || action === "door" || action === "shift")
      modal({ kind: action });
    else if (action === "readUsers" && device)
      await act({
        action: "sync",
        deviceId: device.id,
        start: new Date().toISOString().slice(0, 10),
        end: new Date().toISOString().slice(0, 10),
        usersOnly: true,
      });
    else navigate("attendance");
  }
  return (
    <div className="ac-guide">
      <Card>
        <div className="ac-guide-heading">
          <BookOpen size={30} />
          <div>
            <h2>دليل تشغيل {BRAND.name}</h2>
            <p className="ac-muted">
              من توصيل الجهاز إلى أول تقرير. اختر موضوعاً واتبع الخطوات
              بالترتيب.
            </p>
          </div>
        </div>
        <Field
          label="ابحث داخل دليل التشغيل"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="مثال: كلمة المرور، وردية ليلية، كارت…"
        />
        <small>
          {results.length} موضوعاً من {guideTopics.length}
        </small>
      </Card>
      <div className="ac-guide-layout">
        <nav className="ac-guide-topics" aria-label="موضوعات الدليل">
          {results.map((item) => (
            <button
              key={item.id}
              aria-current={topic.id === item.id ? "page" : undefined}
              onClick={() => {
                setTopicId(item.id);
                setStep(0);
              }}
            >
              <span>{item.category}</span>
              {item.title}
              <ChevronLeft size={16} />
            </button>
          ))}
          {!results.length && (
            <p className="ac-empty">
              لا توجد نتائج. جرّب كلمة مثل «اتصال» أو «حضور».
            </p>
          )}
        </nav>
        <article className="ac-card ac-guide-article">
          <span className="ac-eyebrow">
            {topic.category} · {step + 1} / {topic.steps.length}
          </span>
          <h2>{topic.title}</h2>
          <p>{topic.intro}</p>
          <div
            className="ac-guide-picture"
            role="img"
            aria-label={topic.picture.join(" ثم ")}
          >
            {topic.picture.map((text, index) => (
              <div key={text}>
                <span>{index + 1}</span>
                <strong>{text}</strong>
              </div>
            ))}
          </div>
          <ol className="ac-guide-progress">
            {topic.steps.map((item, index) => (
              <li key={item.title}>
                <button
                  aria-current={step === index ? "step" : undefined}
                  onClick={() => setStep(index)}
                >
                  {index < step ? <CheckCircle2 size={17} /> : index + 1}
                  <span>{item.title}</span>
                </button>
              </li>
            ))}
          </ol>
          <section className="ac-guide-step" aria-live="polite">
            <h3>{current.title}</h3>
            <p>{current.text}</p>
            {current.example && (
              <div className="ac-example">
                <strong>مثال توضيحي</strong>
                <p>{current.example}</p>
              </div>
            )}
            {current.note && (
              <p className="ac-message warning">{current.note}</p>
            )}
            <div className="ac-actions">
              <Button
                onClick={() =>
                  navigate(current.page === "guide" ? "devices" : current.page)
                }
              >
                افتح هذه الصفحة
              </Button>
              {current.action && (
                <Button
                  primary
                  disabled={!available(current.action)}
                  onClick={() => void runAction(current.action!)}
                >
                  {labels[current.action]}
                </Button>
              )}
            </div>
            {current.action && !available(current.action) && (
              <p className="ac-muted">
                يلزم الدور المناسب وجهاز ذو قدرة مثبتة. يمكنك قراءة الشرح وفتح
                الصفحة لمعرفة المتطلبات.
              </p>
            )}
          </section>
          <footer className="ac-guide-footer">
            <Button disabled={step === 0} onClick={() => setStep(step - 1)}>
              السابق
            </Button>
            {step < topic.steps.length - 1 ? (
              <Button primary onClick={() => setStep(step + 1)}>
                التالي
              </Button>
            ) : (
              <Button
                primary
                onClick={() => {
                  const next =
                    guideTopics[
                      (guideTopics.indexOf(topic) + 1) % guideTopics.length
                    ];
                  setTopicId(next.id);
                  setStep(0);
                }}
              >
                الموضوع التالي
              </Button>
            )}
          </footer>
        </article>
      </div>
    </div>
  );
}
