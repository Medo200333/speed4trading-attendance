import {readFileSync,writeFileSync} from 'node:fs';
const p='src/components/attendance-board.tsx';let s=readFileSync(p,'utf8');
if(!s.includes('import { BRAND }'))s='import { BRAND } from "@/lib/brand";\n'+s;
s=s.replace('[["زبيد", `Attendance','[[BRAND.name, `Attendance').replaceAll('>زبيد</','>{BRAND.name}</').replace('>زبيد · in · out · hours on site</','>{BRAND.name} · in · out · hours on site</');writeFileSync(p,s);
