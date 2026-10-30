import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
function walk(dir) { return readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]); }
// Display strings and download names only; do not migrate persistent data or credentials.
for (const file of [...walk('src'), ...['scripts/access-center-e2e.mjs','scripts/access-live-smoke.mjs','scripts/attendance-pull-browser.mjs','scripts/biometrics-browser.mjs']]) {
  if (!/\.(tsx?|mjs)$/.test(file) || /\.test\./.test(file)) continue;
  const before = readFileSync(file, 'utf8');
  const after = before.replaceAll('SKY LINE', 'Speed for Trading').replaceAll('Sky Line', 'Speed for Trading').replaceAll('SKY-LINE-', 'Speed-for-Trading-').replace(/skyline-(employees|attendance|raw-events|audit-latest|live-partial|config-plan)/g,'Speed-for-Trading-$1');
  if (before !== after) writeFileSync(file, after);
}
let file='src/components/access-center.tsx', source=readFileSync(file,'utf8');
source=source.replace('import "./access-center.css";', 'import { Brand } from "./access-brand";\nimport { AppNavigation } from "./access-navigation";\nimport { BRAND } from "@/lib/brand";\nimport "./access-center.css";');
source=source.replace('  { id: "doors", name: "الأبواب", icon: DoorOpen },\n  { id: "permissions", name: "الصلاحيات", icon: ShieldCheck },','  { id: "credentials", name: "بصمة الوجه ووسائل التحقق", icon: Fingerprint },\n  { id: "doors", name: "الأبواب", icon: DoorOpen },');
source=source.replace('  { id: "credentials", name: "وسائل التحقق", icon: Fingerprint },','  { id: "permissions", name: "الصلاحيات", icon: ShieldCheck },');
const start=source.indexOf('          <aside'), end=source.indexOf('          <main className="ac-main">',start);
if(start<0||end<0) throw new Error('sidebar marker not found');
source=source.slice(0,start)+`          <AppNavigation tabs={tabs} active={tab} navigate={navigate} help={() => help("start")} />
          ${''}`+source.slice(end);
source=source.replace('<main className="ac-main">','<main className="ac-main" id="main-content" tabIndex={-1}>\n            <div className="ac-mobile-brand"><Brand compact /></div>');
source=source.replace('<div className="access-center" dir="rtl">','<div className="access-center" dir="rtl">\n        <a className="ac-skip" href="#main-content">انتقل إلى محتوى الصفحة</a>\n        {menu && <AppNavigation drawer tabs={tabs} active={tab} navigate={navigate} help={() => help("start")} close={() => setMenu(false)} />}');
source=source.replace('aria-expanded={menu}\n                  onClick','aria-expanded={menu}\n                  aria-controls={menu ? "access-mobile-navigation" : undefined}\n                  onClick');
source=source.replace('<div className="ac-brand">Speed for Trading</div>', '<Brand />');
source=source.replace('<p role="status">جارٍ تحميل Speed for Trading…</p>', '<div className="ac-loading"><Brand /><span className="ac-loading-line" aria-hidden="true"/><p role="status">جارٍ تجهيز مساحة العمل…</p></div>');
source=source.replace('<h1>مركز البصمة والأبواب</h1>', '<span className="ac-eyebrow">مرحباً بك</span><h1>كل أجهزة موقعك، في مكان واحد</h1>');
source=source.replace('<p>Speed for Trading / مساحة إدارة الأجهزة والحضور</p>','<p>{BRAND.description}</p>');
source=source.replace('["dashboard", "people", "attendance", "guide"]', '["dashboard", "people", "credentials", "attendance"]');
source=source.replace('{item.name}\n              </button>', '{item.id === "credentials" ? "الوجه" : item.id === "attendance" ? "الحضور" : item.name}\n              </button>');
source=source.replace('<nav className="ac-bottom"', '<div className="ac-print-brand"><Brand /></div>\n        <nav className="ac-bottom"');
writeFileSync(file,source);
file='src/routes/__root.tsx'; source=readFileSync(file,'utf8').replace('const APP_NAME = "أول وآخر";', 'const APP_NAME = "Speed for Trading";').replace('سحب حضور وانصراف هيكفيجن: أول بصمة وآخر بصمة في شيت إكسل.', 'إدارة أجهزة Hikvision والموظفين وبصمة الوجه والأبواب والحضور والانصراف.').replace('#12110e','#123462').replace('/__grok/manifest.webmanifest','/manifest.webmanifest').replace('/__grok/icon-180.png','/app-icon.png').replace('{ name: "theme-color", content: "#123462" },','{ name: "theme-color", content: "#123462" },\n      { name: "apple-mobile-web-app-title", content: APP_NAME },');
writeFileSync(file,source);
console.log('Display identity updated. Persistent identifiers retained.');
