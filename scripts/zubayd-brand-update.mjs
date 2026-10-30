import {readFileSync,writeFileSync,readdirSync} from 'node:fs';
const walk=d=>readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${d}/${e.name}`):[`${d}/${e.name}`]);
for(const file of [...walk('src'),...['scripts/access-center-e2e.mjs','scripts/biometrics-browser.mjs','scripts/attendance-pull-browser.mjs','scripts/access-live-smoke.mjs']]){
 if(!/\.(tsx?|mjs)$/.test(file)||/\.test\./.test(file))continue;
 let s=readFileSync(file,'utf8');s=s.replaceAll('Speed for Trading','زبيد').replaceAll('Speed-for-Trading','Zubayd');writeFileSync(file,s);
}
let f='src/lib/hik-connect.server.ts',s=readFileSync(f,'utf8').replace('data.systemName ?? "زبيد"','data.systemName ?? "الفريق"');writeFileSync(f,s);
f='src/components/configuration-studio.tsx';s=readFileSync(f,'utf8').replace('مثال: زبيد','مثال: دخول الموظفين');writeFileSync(f,s);
for(f of ['src/components/configuration-live.tsx','src/components/team-configuration.tsx']){s=readFileSync(f,'utf8').replaceAll('مستوى زبيد','مستوى الوصول');writeFileSync(f,s);}
f='src/lib/hikvision.functions.ts';s=readFileSync(f,'utf8').replaceAll('const { requireActor } = await import("./access/auth.server");','const { requireLegacyActor: requireActor } = await import("./access/auth.server");');
for(const name of ['hikLogin','hikPullChunk','hikReadMap','hikInspectPeopleSchema']){s=s.replace(`    const { ${name} } = await import("./hik-connect.server");`,`    const {requireLegacyActor}=await import("./access/auth.server");\n    await requireLegacyActor();\n    const { ${name} } = await import("./hik-connect.server");`);}writeFileSync(f,s);
f='src/components/access-center.tsx';s=readFileSync(f,'utf8');s=s.replace('  const [data, setData]', '  const [companyId,setCompanyId]=useState("");\n  const [data, setData]');s=s.replace('data: { action: "snapshot" }','data: { action: "snapshot", companyId: companyId || undefined }').replace('const result = await query({ data: input });','const result = await query({ data: {...input,companyId: companyId || undefined} });').replace('const result = await action({ data: input });','const result = await action({ data: {...input,companyId: companyId || undefined} });');
s=s.replace('    void refresh();\n  }, []);','    void refresh();\n  }, [companyId]);');
// Company switch unmounts the active form/workspace; prevent switching during pending operations.
s=s.replace('            <header className="ac-top">',`            <div className="ac-company-bar"><div>{data.company?.logo && <img src={data.company.logo} alt="شعار شركة العميل"/>}<span>شركة العميل</span><strong>{data.company?.nameAr || "الشركة الحالية"}</strong></div><label>الشركة النشطة<select aria-label="الشركة النشطة" value={data.companyId || "legacy"} disabled={busy || Boolean(modal || setupOpen || confirmation)} onChange={e=>{setCompanyId(e.target.value);setEmployeeId("");setSelected("");setEnrollNext(null);}}>{data.companies?.map(c=><option value={c.id} key={c.id}>{c.nameAr}</option>)}</select></label><Button onClick={()=>navigate("companies")}>إدارة الشركات والفروع</Button></div>
            <header className="ac-top">`);
s=s.replace('import { BRAND } from "@/lib/brand";', 'import { BRAND } from "@/lib/brand";\nimport { CompaniesPage } from "./company-workspace";');
s=s.replace('<AccessPanels tab={tab} guideTopic={guideTopic} />','{tab === "companies" ? <CompaniesPage onSelect={id=>{setCompanyId(id);navigate("devices");}}/> : <AccessPanels tab={tab} guideTopic={guideTopic} />}');writeFileSync(f,s);
f='src/components/employee-biometrics.tsx';s=readFileSync(f,'utf8');s=s.replace('  const pendingToken = useRef("");','  const companyId=data.companyId;\n  const pendingToken = useRef("");');
s=s.replaceAll('data: { token:', 'data: { companyId, token:').replaceAll('data: { jobId,','data: { companyId, jobId,').replaceAll('data: { deviceId:', 'data: { companyId, deviceId:').replace('          deviceId: device.id,','          companyId,\n          deviceId: device.id,');writeFileSync(f,s);
f='public/manifest.webmanifest';s=readFileSync(f,'utf8').replaceAll('Speed for Trading','زبيد');writeFileSync(f,s);
f='public/favicon.svg';s=readFileSync(f,'utf8').replaceAll('Speed for Trading','Zubayd').replace('>S</text>','>ز</text>');writeFileSync(f,s);
console.log('Owner identity is Zubayd; customer/device records were not renamed.');
