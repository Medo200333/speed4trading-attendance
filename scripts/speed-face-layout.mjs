import { readFileSync, writeFileSync } from 'node:fs';
const file='src/components/employee-biometrics.tsx';
let source=readFileSync(file,'utf8');
const start=source.indexOf('      <Card title="1. بيانات الموظف">'), end=source.indexOf('      {prepared && (',start);
if(start<0||end<0)throw new Error('Biometrics view markers missing');
const view=`      <Card title="تسجيل بصمة الوجه">
        <StepProgress steps={["الجهاز والموظف", "اختيار الصورة", "التعديل والمعاينة", "جودة الصورة", "تأكيد التسجيل", "النتيجة والتحقق"]} current={step} />
        <div className="ac-enrollment-context"><strong>{person.name}</strong><span>رقم <bdi>{person.employeeNo}</bdi> · {device.name}</span></div>
        {error && <p role="alert" className="ac-message error">{error}</p>}
        {loginNeeded && admin && <Button onClick={() => setup(device)}>إعداد الاتصال وإدخال اعتماد الجهاز</Button>}
        {step === 0 && <div className="ac-stack">
          {selection}
          <p>اختر الموظف الموجود على الجهاز. سنقرأ وسائل التحقق قبل إتاحة التسجيل المدعوم.</p>
          <div className="ac-actions"><Button primary onClick={() => void load()} disabled={locked || busy || data.actor.role === "viewer"}>فحص وسائل الموظف (قراءة فقط)</Button>
            <Button onClick={() => modal({kind:"person",person})} disabled={!admin || locked}>تعديل بيانات الموظف</Button></div>
          {inspection && <p className="ac-muted">آخر فحص لهذا الموظف: <When value={inspection.checkedAt}/></p>}
          <Support value={faceSupport}/>
          <p>حالة الوجه: {state.facePresent === true ? "يوجد وجه مسجل" : state.facePresent === false ? "لا يوجد وجه في المكتبة المفحوصة" : "لم تُقرأ بعد؛ ابدأ بالفحص"}.</p>
          <details className="ac-details"><summary>بصمات الأصابع وطريقة التسجيل اليدوي</summary><Support value={state.fingerprint}/><ol><li>من شاشة Hikvision افتح إدارة المستخدمين بحساب المسؤول.</li><li>اختر رقم <bdi>{person.employeeNo}</bdi> ثم الوجه، أو الإصبع إذا كان هناك مستشعر مدعوم فعلياً.</li><li>اتبع تعليمات الجهاز واحفظ، ثم ارجع واضغط فحص وسائل الموظف.</li></ol><p>لا يستخدم البرنامج مستشعر الإصبع في الهاتف.</p></details>
        </div>}
        {step === 1 && <div className="ac-stack">
          <h3>كيف تريد تسجيل الوجه؟</h3>
          <div className="ac-choice-grid" role="group" aria-label="مصدر صورة الوجه"><Button aria-pressed={source === "phone"} onClick={() => setSource("phone")} disabled={state.upload.state !== "ready"}>صورة من الهاتف أو المعرض</Button><Button aria-pressed={source === "terminal"} onClick={() => {setSource("terminal");setPhoto(null);setReset(v=>v+1);}} disabled={state.capture.state !== "ready"}>كاميرا جهاز البصمة</Button></div>
          {source === "terminal" && <><Support value={state.capture}/><p>لن تبدأ الكاميرا الآن. سنعرض تعليمات الوقوف أمام الجهاز ثم نطلب تأكيدك.</p></>}
        </div>}
        {admin && step >= 1 && step <= 4 && source === "phone" && <FacePhotoEditor key={reset} onPhoto={setPhoto} onReady={setImageReady} stage={step === 1 ? "choose" : step === 2 ? "crop" : step === 3 ? "quality" : "review"} disabled={locked}/>}
        {source === "terminal" && step === 2 && <div className="ac-instruction"><h3>جهّز الموظف أمام كاميرا Hikvision</h3><ol><li>تأكد من أن الشخص هو {person.name} ورقمه <bdi>{person.employeeNo}</bdi>.</li><li>قف أمام الجهاز والوجه في منتصف الإطار، بإضاءة مناسبة.</li><li>بعد التأكيد في الخطوة الأخيرة ستبدأ الكاميرا. اتبع تعليمات شاشة الجهاز حتى انتهاء الالتقاط.</li></ol><p>صورة كاميرا الجهاز لا تتوفر للمعاينة قبل بدء الالتقاط. لا يعني الالتقاط وحده أن الوجه حُفظ.</p></div>}
        {source === "terminal" && step === 3 && <div className="ac-instruction"><h3>مراجعة الاستعداد للتصوير</h3><p>وجه واحد واضح دون قناع أو نظارة شمسية. الجهاز هو الذي يحكم على جودة الالتقاط.</p><label className="ac-check"><input type="checkbox" checked={atDevice} onChange={e=>setAtDevice(e.target.checked)}/>الموظف الصحيح يقف أمام الجهاز ومستعد للتسجيل.</label></div>}
        {step === 4 && <div className="ac-stack"><h3>راجع العملية قبل إرسالها</h3><p>سيُربط الوجه برقم <bdi>{person.employeeNo}</bdi> على {device.name}. بعد إرسال التسجيل سنعيد قراءة سجل هذا الرقم للتحقق من الحفظ.</p>
          {state.facePresent && <label className="ac-check"><input type="checkbox" checked={replaceExisting} disabled={locked} onChange={e=>setReplace(e.target.checked)}/>أوافق على استبدال الوجه الحالي لهذا الموظف بعد المعاينة والتأكيد.</label>}
          <p className="ac-muted">الصورة مؤقتة في الذاكرة؛ لا تُحفظ في المتصفح أو الملفات العامة.</p>
          <Button primary disabled={locked || loginNeeded || (source === "phone" ? !photo || state.upload.state !== "ready" : !atDevice || state.capture.state !== "ready") || Boolean(state.facePresent && !replaceExisting)} onClick={()=>void preview(source)}>مراجعة تأكيد التسجيل</Button>
        </div>}
        {step === 5 && job && <div className={\`ac-message \${["failed","uncertain"].includes(job.phase) ? "error" : job.phase === "verified" ? "success" : ""}\`} role="status"><strong>{job.phase === "verified" ? "اكتمل وتحققنا منه" : job.phase === "running" ? "جارٍ التسجيل والتحقق من الجهاز" : job.phase === "uncertain" ? "نتيجة غير مؤكدة" : "فشل التسجيل"}</strong><p>{job.message}</p>
          {job.phase === "running" && <progress max={100} value={job.progress} aria-label="تقدم تسجيل الوجه"/>}
          {job.phase === "running" && jobSource === "terminal" && <><Button onClick={()=>void poll({data:{jobId,stop:true}}).then(r=>{if(r.ok)setJob(r.data);})}>إيقاف المتابعة فقط</Button><p>قد يستمر الجهاز حتى انتهاء مهلته؛ لم يثبت دعم أمر إلغاء التسجيل عن بعد.</p></>}
          {job.phase !== "running" && <Button onClick={()=>{setStep(0);setJob(undefined);setJobId("");setInspection(undefined);setReplace(false);}}>العودة إلى بيانات الموظف وفحصه</Button>}
        </div>}
        {step < 5 && <footer className="ac-wizard-actions">
          {step > 0 && <Button disabled={locked} onClick={()=>setStep(s=>s-1)}>السابق</Button>}
          {step === 0 && <Button primary disabled={locked || !admin || loginNeeded || !inspection || (state.upload.state !== "ready" && state.capture.state !== "ready")} onClick={()=>{setSource(state.upload.state === "ready" ? "phone" : "terminal");setStep(1);}}>التالي: اختيار صورة الوجه</Button>}
          {step === 1 && <Button primary disabled={locked || (source === "phone" && !imageReady)} onClick={()=>setStep(2)}>التالي: التعديل والمعاينة</Button>}
          {step === 2 && <Button primary disabled={locked || (source === "phone" && !imageReady)} onClick={()=>setStep(3)}>التالي: مراجعة الجودة</Button>}
          {step === 3 && <Button primary disabled={locked || (source === "phone" ? !photo : !atDevice)} onClick={()=>setStep(4)}>التالي: تأكيد التسجيل</Button>}
          {step > 0 && <Button disabled={locked} onClick={()=>{setPhoto(null);setReset(v=>v+1);setReplace(false);setAtDevice(false);setStep(0);}}>إلغاء العملية</Button>}
        </footer>}
      </Card>
`;
// Template quoting is kept literal for the generated TSX expressions.
source=source.slice(0,start)+view.replaceAll('\\`','`').replaceAll('\\$','$')+source.slice(end);
source=source.replace('    setReset((v) => v + 1);\n  }\n  async function send()', '    setReset((v) => v + 1);\n    setStep(1);\n  }\n  async function send()');
writeFileSync(file,source);

const workflow='src/components/access-workflows.tsx';source=readFileSync(workflow,'utf8');
const credentials=source.indexOf('export function CredentialsPanel()'), boundary=source.indexOf('export function PermissionsPanel()',credentials);
let panel=source.slice(credentials,boundary);
panel=panel.replace('  const [personId, setPersonId]', '  const [section, setSection] = useState("face");\n  const [personId, setPersonId]');
const selectorStart=panel.indexOf('      <div className="ac-grid">'), selectorEnd=panel.indexOf('      {!person ?',selectorStart);
const selectors=panel.slice(selectorStart,selectorEnd).trim();
panel=panel.slice(0,selectorStart)+`      <div className="ac-tabs" role="group" aria-label="أقسام وسائل التحقق">{[["face","تسجيل الوجه"],["cards","الكروت"],["permissions","صلاحيات الأبواب"],["advanced","الرقم السري"]].map(([id,label])=><Button key={id} aria-pressed={section===id} onClick={()=>setSection(id)}>{label}</Button>)}</div>
      {(section !== "face" || !person) && ${selectors}}
`+panel.slice(selectorEnd);
panel=panel.replace('{device && (','{device && section === "face" && (').replace('              device={device}\n',`              device={device}
              selection={${selectors}}
`);
panel=panel.replace('<Card title={\`4. كروت \${person.name}\`}>','{section === "cards" && <Card title={\`كروت \${person.name}\`}>').replace('          <Card title="5. صلاحيات الأبواب">','          }\n          {section === "permissions" && <Card title="صلاحيات الأبواب">').replace('          <div className="ac-grid">\n            <Card title="الرقم السري PIN">', '          }\n          {section === "advanced" && <div className="ac-grid">\n            <Card title="الرقم السري PIN">');
panel=panel.replace('          </div>\n        </>', '          </div>}\n        </>');
source=source.slice(0,credentials)+panel+source.slice(boundary);writeFileSync(workflow,source);
