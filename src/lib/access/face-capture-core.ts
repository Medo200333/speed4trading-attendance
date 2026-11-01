/**
 * Remote face capture on Hikvision MinMoe terminals (DS-K1T342 etc.), the way iVMS-4200 does it:
 *  1. POST /ISAPI/AccessControl/CaptureFaceData (CaptureFaceDataCond, dataType) — the terminal opens its camera
 *     and KEEPS THE HTTP REQUEST OPEN until a face is captured or its own timeout. The reply is
 *     multipart/mixed: an XML/JSON "CaptureFaceData" part + the face JPEG (dataType=binary), or XML with faceDataUrl.
 *  2. If the reply carries no picture yet, poll GET /ISAPI/AccessControl/CaptureFaceData/Progress
 *     (captureProgress 0..100, isCurRequestOver); at 100 the picture comes inline or as faceDataUrl.
 *  3. The JPEG is then uploaded to the face library (FDLib FaceDataRecord / FDSetUp) by the caller.
 * Old bug: the HTTP client aborted after 20 s, so the terminal kept its capture screen but the app lost the reply.
 */
export type Reply = { status: number; text: string; bytes: Uint8Array; contentType: string };
export type CaptureDeps = {
  post: (body: string, timeoutMs: number) => Promise<Reply>;
  progress: () => Promise<Reply>;
  picture: (url: string) => Promise<Reply>;
  sleep: (ms: number) => Promise<void>;
  onStep: (progress: number, message: string) => void;
  stopped: () => boolean;
};
export class CaptureError extends Error { code: string; constructor(code: string, message: string) { super(message); this.code = code; } }

export const CAPTURE_TIMEOUT_MS = 75_000;
export const STEP = {
  open: "1/3 · الكاميرا مفتوحة على شاشة الجهاز — قف أمامها على بُعد 30-50 سم وانظر مباشرة",
  wait: "2/3 · الجهاز يلتقط الوجه… لا تتحرك",
  save: "3/3 · تم الالتقاط — جارٍ حفظ الوجه للموظف",
};

const isJpeg = (b: Uint8Array) => b.length > 4 && b[0] === 0xff && b[1] === 0xd8;
const tag = (text: string, name: string) => new RegExp(`<${name}>([^<]*)</${name}>`, "i").exec(text)?.[1] ?? (new RegExp(`"${name}"\\s*:\\s*"?([^",}]*)`, "i").exec(text)?.[1]);

/** Split a multipart reply; returns the first JPEG part and the concatenated text parts. */
export function parseCaptureReply(r: Reply): { photo: Uint8Array | null; text: string } {
  const bytes = Buffer.from(r.bytes);
  if (/image\/jpe?g/i.test(r.contentType) || isJpeg(bytes)) return { photo: new Uint8Array(bytes), text: "" };
  const boundary = /boundary\s*=\s*"?([^";\s]+)/i.exec(r.contentType)?.[1];
  if (!boundary) return { photo: null, text: r.text || bytes.toString("utf8") };
  const marker = Buffer.from("--" + boundary);
  let photo: Uint8Array | null = null, text = "";
  let pos = bytes.indexOf(marker);
  while (pos >= 0) {
    const next = bytes.indexOf(marker, pos + marker.length);
    const head = bytes.indexOf(Buffer.from("\r\n\r\n"), pos);
    if (head < 0 || next < 0 || head > next) break;
    const headers = bytes.subarray(pos, head).toString("latin1");
    let end = next; if (bytes[end - 2] === 0x0d && bytes[end - 1] === 0x0a) end -= 2;
    const body = bytes.subarray(head + 4, end);
    if (!photo && (/content-type:\s*image\//i.test(headers) || isJpeg(body))) photo = new Uint8Array(body);
    else text += body.toString("utf8");
    pos = next;
  }
  return { photo, text };
}

function deviceStatus(r: Reply, text: string) {
  if (r.status === 401 || r.status === 403) throw new CaptureError("AUTH", "رفض الجهاز اسم الدخول أو كلمة المرور. أعد إدخالها من صفحة الأجهزة.");
  if (r.status >= 400) {
    const sub = tag(text, "subStatusCode") || tag(text, "errorMsg") || "";
    if (/notSupport|invalidOperation/i.test(sub)) throw new CaptureError("UNSUPPORTED", `الجهاز لا يدعم الالتقاط عن بعد بهذه الإعدادات (${sub}).`);
    if (/busy|deviceBusy/i.test(sub)) throw new CaptureError("BUSY", "الجهاز مشغول بعملية التقاط أخرى. انتظر حتى تختفي شاشة الكاميرا ثم أعد المحاولة.");
    throw new CaptureError("DEVICE", `رد الجهاز ${r.status}${sub ? ` (${sub})` : ""}.`);
  }
}

async function finish(deps: CaptureDeps, photo: Uint8Array | null, text: string) {
  if (photo && isJpeg(photo)) return photo;
  const url = tag(text, "faceDataUrl");
  if (url) {
    const pic = await deps.picture(url);
    const parsed = parseCaptureReply(pic);
    if (parsed.photo && isJpeg(parsed.photo)) return parsed.photo;
  }
  return null;
}

export async function captureFace(deps: CaptureDeps, infrared: boolean): Promise<Uint8Array> {
  deps.onStep(0, STEP.open);
  const cond = `<CaptureFaceDataCond version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema"><captureInfrared>${infrared}</captureInfrared><dataType>binary</dataType></CaptureFaceDataCond>`;
  let reply: Reply;
  try { reply = await deps.post(cond, CAPTURE_TIMEOUT_MS); }
  catch (e) {
    // Request dropped (network/timeout) — the terminal may still finish; fall through to progress polling.
    reply = { status: 0, text: String((e as Error)?.message || ""), bytes: new Uint8Array(), contentType: "" };
  }
  for (let round = 0; round < 40; round++) {
    if (deps.stopped()) throw new CaptureError("STOPPED", "أوقفت المتابعة. لو شاشة الكاميرا ما زالت ظاهرة على الجهاز انتظر حتى تختفي (حوالي دقيقة) قبل المحاولة من جديد.");
    if (reply.status) {
      const parsed = parseCaptureReply(reply);
      deviceStatus(reply, parsed.text);
      const progress = Math.max(0, Math.min(100, Number(tag(parsed.text, "captureProgress")) || (parsed.photo ? 100 : 0)));
      const photo = await finish(deps, parsed.photo, parsed.text);
      if (photo) { deps.onStep(100, STEP.save); return photo; }
      deps.onStep(progress, progress > 0 ? STEP.wait : STEP.open);
      const over = tag(parsed.text, "isCurRequestOver");
      if (over === "true" && progress < 100)
        throw new CaptureError("NO_FACE", "انتهت مهلة الكاميرا على الجهاز دون التقاط وجه. قف أمام الكاميرا مباشرة وفي إضاءة جيدة، ثم اضغط «التقاط من الجهاز» مرة أخرى.");
      if (progress >= 100) throw new CaptureError("NO_IMAGE", "أكمل الجهاز الالتقاط لكنه لم يُرجع صورة. حدّث برنامج الجهاز أو استخدم «رفع صورة».");
    }
    await deps.sleep(1500);
    try { reply = await deps.progress(); } catch { reply = { status: 0, text: "", bytes: new Uint8Array(), contentType: "" }; }
  }
  throw new CaptureError("TIMEOUT", "لم يؤكد الجهاز التقاط الوجه خلال المهلة. راجع شاشة الجهاز وأعد المحاولة.");
}
