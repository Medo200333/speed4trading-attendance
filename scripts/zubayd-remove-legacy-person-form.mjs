import {readFileSync,writeFileSync} from 'node:fs';
const file='src/components/access-forms.tsx';let s=readFileSync(file,'utf8');
const start=s.indexOf('            {modal.kind === "person" ? ('),end=s.indexOf('            {modal.kind === "door" ? (',start);if(start<0||end<0)throw new Error('legacy person form marker');s=s.slice(0,start)+s.slice(end);
s=s.replace('                : modal.kind === "person"\n                  ? "معاينة التغيير على الجهاز"\n                  : "حفظ داخل البرنامج"','                : "حفظ داخل البرنامج"');writeFileSync(file,s);
