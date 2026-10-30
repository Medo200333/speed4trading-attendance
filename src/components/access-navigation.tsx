import { useEffect, useRef } from "react";
import { BookOpen, X, type LucideIcon } from "lucide-react";
import { Brand } from "./access-brand";

type Tab = { id: string; name: string; icon: LucideIcon };
export function AppNavigation({
  tabs,
  active,
  navigate,
  help,
  drawer = false,
  close,
}: {
  tabs: Tab[];
  active: string;
  navigate: (page: string) => void;
  help: () => void;
  drawer?: boolean;
  close?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!drawer) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const resize = () => {
      if (matchMedia("(min-width: 1200px)").matches) close?.();
    };
    window.addEventListener("resize", resize);
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus();
      window.removeEventListener("resize", resize);
    };
  }, [drawer]);
  const content = (
    <>
      <div className="ac-nav-brand">
        <Brand />
        {drawer && (
          <button
            className="ac-drawer-close"
            aria-label="إغلاق القائمة"
            onClick={close}
          >
            <X size={22} />
          </button>
        )}
      </div>
      <nav aria-label="أقسام البرنامج">
        {tabs.map((item) => (
          <button
            key={item.id}
            onClick={() => navigate(item.id)}
            aria-current={active === item.id ? "page" : undefined}
          >
            <item.icon size={21} aria-hidden="true" />
            <span>{item.name}</span>
          </button>
        ))}
      </nav>
      <footer>
        <button onClick={help}>
          <BookOpen size={20} aria-hidden="true" />
          دليل البداية السريعة
        </button>
        <small>
          ابدأ بتوصيل الجهاز، ثم أضف الموظفين.
          <br />
          إجراءات الجهاز تتطلب تأكيدك.
        </small>
      </footer>
    </>
  );
  if (!drawer)
    return (
      <aside
        className="ac-sidebar ac-desktop-sidebar"
        aria-label="التنقل الرئيسي"
      >
        {content}
      </aside>
    );
  return (
    <div
      className="ac-drawer-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close?.();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close?.();
        }
        if (e.key === "Tab") {
          const controls = Array.from(
              ref.current?.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              ) || [],
            ),
            first = controls[0],
            last = controls.at(-1);
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last?.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first?.focus();
          }
        }
      }}
    >
      <div
        className="ac-sidebar ac-drawer"
        id="access-mobile-navigation"
        role="dialog"
        aria-modal="true"
        aria-label="قائمة أقسام البرنامج"
        ref={ref}
      >
        {content}
      </div>
    </div>
  );
}
