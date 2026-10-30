import { useEffect, useRef, useState } from "react";
import {
  FACE_PHOTO_LIMIT,
  FACE_PHOTO_WIDTH,
  FACE_PHOTO_HEIGHT,
} from "@/lib/access/face-image";
import { Button } from "./access-ui";
import {
  Camera,
  ImagePlus,
  ZoomIn,
  MoveHorizontal,
  MoveVertical,
  RotateCcw,
} from "lucide-react";
export function FacePhotoEditor({
  onPhoto,
  onReady,
  onSelected,
  onRetake,
  stage = "choose",
  disabled = false,
}: {
  onPhoto: (base64: string | null) => void;
  onReady: (ready: boolean) => void;
  onSelected: (selected: boolean) => void;
  onRetake: () => void;
  stage?: "choose" | "crop" | "quality" | "review";
  disabled?: boolean;
}) {
  const [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [zoom, setZoom] = useState(1),
    [x, setX] = useState(50),
    [y, setY] = useState(50),
    [preview, setPreview] = useState(""),
    [quality, setQuality] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [tool, setTool] = useState("zoom");
  const canvas = useRef<HTMLCanvasElement>(null),
    image = useRef<HTMLImageElement | null>(null),
    generation = useRef(0);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  useEffect(() => {
    onSelected(false);
  }, []);
  useEffect(() => {
    setConfirmed(false);
    onPhoto(null);
    onReady(Boolean(preview));
  }, [preview]);
  useEffect(() => {
    if (!url) return;
    const current = ++generation.current,
      img = new Image();
    image.current = img;
    img.onload = () => {
      if (current !== generation.current) return;
      if (
        img.naturalWidth > 8192 ||
        img.naturalHeight > 8192 ||
        img.naturalWidth * img.naturalHeight > 32000000
      ) {
        setError("الصورة كبيرة جداً. اختر صورة أصغر من 32 ميجابكسل.");
        image.current = null;
        return;
      }
      draw(img);
    };
    img.onerror = () =>
      setError("تعذر فتح الصورة. اختر JPEG أو PNG صالحاً، أو أعد التصوير.");
    img.src = url;
    return () => {
      generation.current++;
      img.onload = null;
      img.onerror = null;
    };
  }, [url]);
  useEffect(() => {
    if (image.current?.complete && image.current.naturalWidth)
      draw(image.current);
  }, [zoom, x, y, stage]);
  function draw(img: HTMLImageElement) {
    // Prepare bytes independently of the visible canvas and its step/viewport lifecycle.
    const target = document.createElement("canvas");
    target.width = FACE_PHOTO_WIDTH;
    target.height = FACE_PHOTO_HEIGHT;
    const ctx = target.getContext("2d");
    if (!ctx) {
      setError(
        "تعذر تجهيز الصورة في هذا المتصفح. أعد اختيارها أو جرّب متصفحاً آخر.",
      );
      return;
    }
    onSelected(true);
    const scale =
      Math.max(
        FACE_PHOTO_WIDTH / img.naturalWidth,
        FACE_PHOTO_HEIGHT / img.naturalHeight,
      ) * zoom;
    const width = img.naturalWidth * scale,
      height = img.naturalHeight * scale;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, target.width, target.height);
    ctx.drawImage(
      img,
      (-(width - target.width) * x) / 100,
      (-(height - target.height) * y) / 100,
      width,
      height,
    );
    const visible = canvas.current;
    if (visible) visible.getContext("2d")?.drawImage(target, 0, 0);
    const pixels = ctx.getImageData(0, 0, target.width, target.height).data;
    let sum = 0,
      square = 0,
      difference = 0,
      n = 0;
    for (let i = 0; i < pixels.length; i += 64) {
      const value = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3;
      sum += value;
      square += value * value;
      if (i >= 64)
        difference += Math.abs(
          value - (pixels[i - 64] + pixels[i - 63] + pixels[i - 62]) / 3,
        );
      n++;
    }
    const mean = sum / n,
      variance = square / n - mean * mean;
    const problem =
      mean < 35
        ? "الصورة مظلمة جداً؛ أضئ الوجه من الأمام."
        : mean > 235
          ? "الصورة شديدة السطوع؛ تجنب الضوء المباشر."
          : variance < 60 || difference / n < 1
            ? "الصورة مسطحة أو شديدة الضبابية؛ أعد التصوير."
            : "";
    setQuality(
      problem ||
        "فحص الإضاءة والتباين المبدئي مقبول. القرار النهائي لجودة الوجه للجهاز.",
    );
    if (problem) {
      setPreview("");
      onPhoto(null);
      return;
    }
    let value = target.toDataURL("image/jpeg", 0.88);
    for (const q of [0.78, 0.65, 0.5])
      if ((value.length - value.indexOf(",") - 1) * 0.75 > FACE_PHOTO_LIMIT)
        value = target.toDataURL("image/jpeg", q);
    if ((value.length - value.indexOf(",") - 1) * 0.75 > FACE_PHOTO_LIMIT) {
      setError("الصورة أكبر من 200 كيلوبايت بعد الضغط. اختر لقطة أبسط.");
      setPreview("");
      return;
    }
    setError("");
    setPreview(value);
  }
  function select(file: File | undefined) {
    if (!file) return;
    clear();
    onPhoto(null);
    setPreview("");
    setError("");
    setConfirmed(false);
    if (!/^image\//.test(file.type) || file.size > 10 * 1024 * 1024) {
      setError(
        "اختر صورة أصغر من 10 ميجابايت. تتحول النسخة المقصوصة إلى JPEG دون بيانات الموقع.",
      );
      return;
    }
    setZoom(1);
    setX(50);
    setY(50);
    setUrl(URL.createObjectURL(file));
  }
  function clear() {
    generation.current++;
    setUrl("");
    setPreview("");
    image.current = null;
    onPhoto(null);
    setConfirmed(false);
    setQuality("");
    onReady(false);
    onSelected(false);
  }
  return (
    <div className="ac-stack ac-face-editor">
      <div hidden={stage !== "choose"}>
        <p>
          التقط صورة واضحة لموظف واحد، بإضاءة أمامية وخلفية بسيطة. اختيار الصورة
          لا يرسلها إلى الجهاز.
        </p>
        <div className="ac-photo-choices">
          <label className="ac-photo-input">
            <Camera size={32} aria-hidden="true" />
            التقاط صورة بالكاميرا
            <input
              aria-label="التقاط صورة بالكاميرا"
              type="file"
              accept="image/*"
              capture="user"
              disabled={disabled}
              onChange={(e) => {
                select(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
          <label className="ac-photo-input">
            <ImagePlus size={32} aria-hidden="true" />
            اختيار صورة من المعرض
            <input
              aria-label="اختيار صورة من المعرض"
              type="file"
              accept="image/*"
              disabled={disabled}
              onChange={(e) => {
                select(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        <p className="ac-muted">
          يفتح منتقي الصور في هاتفك؛ قد يتيح الكاميرا أو الملفات حسب المتصفح،
          حتى عند فتح البرنامج عبر HTTP.
        </p>
        {url && <p role="status">اختيرت صورة. اضغط التالي لضبطها.</p>}
      </div>
      {url && (
        <div
          hidden={stage === "choose"}
          className={`ac-photo-workspace ${stage === "crop" ? "editing" : "reviewing"}`}
        >
          <div className="ac-photo-canvas">
            <canvas
              ref={canvas}
              width={FACE_PHOTO_WIDTH}
              height={FACE_PHOTO_HEIGHT}
              aria-label="معاينة قص صورة الوجه"
            />
            <p className="ac-muted">
              {stage === "crop"
                ? "ضع الوجه في المنتصف واترك مساحة حول الرأس."
                : "الصورة التي ستُرسل للموظف المحدد"}
            </p>
          </div>
          <div hidden={stage !== "crop"} className="ac-crop-tools">
            <div
              className="ac-tool-tabs"
              role="group"
              aria-label="أداة تعديل الصورة"
            >
              {[
                { id: "zoom", name: "تكبير", icon: ZoomIn },
                { id: "x", name: "تحريك أفقي", icon: MoveHorizontal },
                { id: "y", name: "تحريك رأسي", icon: MoveVertical },
              ].map((item) => (
                <Button
                  key={item.id}
                  aria-pressed={tool === item.id}
                  onClick={() => setTool(item.id)}
                >
                  <item.icon size={20} aria-hidden="true" />
                  {item.name}
                </Button>
              ))}
            </div>
            <div hidden={tool !== "zoom"}>
              <label>
                تكبير القص
                <input
                  aria-label="تكبير القص"
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  disabled={disabled}
                />
              </label>
            </div>
            <div hidden={tool !== "x"}>
              <label>
                موضع الوجه أفقياً
                <input
                  aria-label="موضع الوجه أفقياً"
                  type="range"
                  min="0"
                  max="100"
                  value={x}
                  onChange={(e) => setX(Number(e.target.value))}
                  disabled={disabled}
                />
              </label>
            </div>
            <div hidden={tool !== "y"}>
              <label>
                موضع الوجه رأسياً
                <input
                  aria-label="موضع الوجه رأسياً"
                  type="range"
                  min="0"
                  max="100"
                  value={y}
                  onChange={(e) => setY(Number(e.target.value))}
                  disabled={disabled}
                />
              </label>
            </div>
            <Button
              onClick={() => {
                setZoom(1);
                setX(50);
                setY(50);
              }}
              disabled={disabled}
            >
              <RotateCcw size={18} aria-hidden="true" />
              إعادة ضبط القص
            </Button>
            <p className="ac-muted">
              استخدم أداة واحدة في كل مرة. يمكنك ضبط الشريط باللمس أو بأسهم لوحة
              المفاتيح.
            </p>
            <p role="status" className="ac-message">
              {quality}
            </p>
          </div>
          <div hidden={stage !== "quality"} className="ac-quality-review">
            <h3>قبل التسجيل، راجع هذه الشروط</h3>
            <ul>
              <li>وجه واحد واضح ومواجه للكاميرا.</li>
              <li>العينان ظاهرتان، دون قناع أو نظارة شمسية.</li>
              <li>إضاءة متوازنة، دون ظلال قوية أو ضبابية.</li>
            </ul>
            <p role="status">{quality}</p>
            <p className="ac-muted">
              النسخة المرسلة 480×640 JPEG بحد 200 كيلوبايت. هذه حدود التطبيق
              المحافظة، وليست حدوداً منسوبة للجهاز.
            </p>
            <label className="ac-check">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={!preview || disabled}
                onChange={(e) => {
                  setConfirmed(e.target.checked);
                  onPhoto(
                    e.target.checked && preview ? preview.split(",")[1] : null,
                  );
                }}
              />
              أؤكد أن الصورة لموظف واحد، الوجه واضح ومواجه للكاميرا بالكامل دون
              قناع أو نظارة شمسية.
            </label>
          </div>
          <div hidden={stage === "review"}>
            <Button
              onClick={() => {
                clear();
                onRetake();
              }}
              disabled={disabled}
            >
              إلغاء الصورة / إعادة التصوير
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p className="ac-message error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
