import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const folder = join(import.meta.dirname, "../.codex-backups/access-center-20261022/references");
const [fileMatch, range] = process.argv.slice(2);
for (const name of readdirSync(folder).filter((name) => name.endsWith(".txt") && (!fileMatch || name.includes(fileMatch)))) {
  const body = readFileSync(join(folder, name), "utf8");
  const pages = [...body.matchAll(/=== PAGE (\d+) ===\r?\n([\s\S]*?)(?=\r?\n\r?\n=== PAGE|$)/g)];
  console.log("DOCUMENT", name);
  if (range?.startsWith("find:")) {
    for (const page of pages.filter((page) => page[2].includes(range.slice(5)))) console.log("PAGE", page[1]);
  } else if (range) {
    const wanted = range.split(",").flatMap((span) => { const [a, b] = span.split("-").map(Number); return Array.from({length: (b || a) - a + 1}, (_, i) => a + i); });
    for (const page of pages.filter((page) => wanted.includes(Number(page[1])))) console.log(page[0]);
  } else {
    console.log(pages.slice(0, 7).map((page) => page[0]).join("\n").slice(0, 26000));
    const relevant = pages.filter((page) => /\/ISAPI\/.*capabilities|UserInfo\/Record|RemoteControl\/door|UserInfo\/Modify|FingerPrint\/.*capabilities|CardInfo\/Record/.test(page[2]));
    console.log("RELEVANT PAGES", relevant.map((page) => Number(page[1])));
  }
}
