import { StrictMode, useEffect, useMemo, useRef, useState } from "react";
import type { PointerEvent, ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ImageUp, RotateCcw, SlidersHorizontal, Table2, X, Youtube } from "lucide-react";
import "./styles.css";
import {
  FILTERS,
  createEmptyKernel,
  filterGroups,
  materializeFilter,
  resizeKernel,
  type FilterPreset,
  type Kernel,
} from "./filters";
import { applyKernelToPixel, buildConvolutionSample, rgbaToGray, type ConvolutionSample, type SampleChannel } from "./convolution";

const maxImageSide = 900;
const customFilterId = "custom";
const channelOptions: Array<{ id: SampleChannel; label: string; description: string }> = [
  { id: "gray", label: "밝기", description: "설명용 흑백 밝기" },
  { id: "r", label: "R", description: "빨강 채널" },
  { id: "g", label: "G", description: "초록 채널" },
  { id: "b", label: "B", description: "파랑 채널" },
];

type LoadedImage = {
  width: number;
  height: number;
  source: ImageData;
  result: ImageData;
  mask: Uint8ClampedArray;
  touchedCount: number;
};

type MatrixCell = {
  x: number;
  y: number;
  source: number;
  result: number;
  touched: boolean;
};

function createFallbackImage(): LoadedImage {
  const width = 520;
  const height = 340;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas is not supported.");
  }

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#f7dd72");
  gradient.addColorStop(0.46, "#5bbad5");
  gradient.addColorStop(1, "#2f4858");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#f05d5e";
  ctx.fillRect(68, 72, 150, 170);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(105, 112, 74, 92);
  ctx.fillStyle = "#51344d";
  ctx.beginPath();
  ctx.arc(330, 170, 88, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(278, 122);
  ctx.lineTo(386, 218);
  ctx.moveTo(386, 122);
  ctx.lineTo(278, 218);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  for (let i = 0; i < 11; i += 1) {
    ctx.fillRect(48 + i * 40, 292, 22, 22);
  }

  const source = ctx.getImageData(0, 0, width, height);
  return {
    width,
    height,
    source,
    result: new ImageData(new Uint8ClampedArray(source.data), width, height),
    mask: new Uint8ClampedArray(width * height),
    touchedCount: 0,
  };
}

async function loadImage(file: File): Promise<LoadedImage> {
  const imageUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = imageUrl;
    await image.decode();

    const scale = Math.min(1, maxImageSide / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      throw new Error("Canvas is not supported.");
    }
    ctx.drawImage(image, 0, 0, width, height);
    const source = ctx.getImageData(0, 0, width, height);
    return {
      width,
      height,
      source,
      result: new ImageData(new Uint8ClampedArray(source.data), width, height),
      mask: new Uint8ClampedArray(width * height),
      touchedCount: 0,
    };
  } finally {
    URL.revokeObjectURL(imageUrl);
  }
}

function App() {
  const [selectedId, setSelectedId] = useState(FILTERS[0].id);
  const [kernelSize, setKernelSize] = useState(3);
  const [brushRadius, setBrushRadius] = useState(18);
  const [showImageMatrix, setShowImageMatrix] = useState(false);
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  const [sampleChannel, setSampleChannel] = useState<SampleChannel>("gray");
  const [customKernel, setCustomKernel] = useState<Kernel>([
    [0, -1, 0],
    [-1, 5, -1],
    [0, -1, 0],
  ]);
  const [customKernelText, setCustomKernelText] = useState<string[][]>([
    ["0", "-1", "0"],
    ["-1", "5", "-1"],
    ["0", "-1", "0"],
  ]);
  const [loaded, setLoaded] = useState<LoadedImage | null>(null);
  const [sample, setSample] = useState<ConvolutionSample | null>(null);
  const [fileName, setFileName] = useState("샘플 이미지");
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState("");
  const scratchRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const loadedRef = useRef<LoadedImage | null>(null);
  const lastSamplePointRef = useRef<{ x: number; y: number } | null>(null);

  const customFilter = useMemo<FilterPreset>(
    () => ({
      id: customFilterId,
      name: "직접 만든 필터",
      group: "커스텀",
      description: `입력한 ${kernelSize * kernelSize}개 숫자로 바로 계산해요.`,
      kernel: customKernel,
    }),
    [customKernel, kernelSize],
  );

  const selectedFilter = useMemo(() => {
    if (selectedId === customFilterId) {
      return customFilter;
    }
    const preset = FILTERS.find((filter) => filter.id === selectedId) ?? FILTERS[0];
    return materializeFilter(preset, kernelSize);
  }, [customFilter, kernelSize, selectedId]);

  useEffect(() => {
    const fallback = createFallbackImage();
    loadedRef.current = fallback;
    setLoaded(fallback);
  }, []);

  useEffect(() => {
    if (!isVideoOpen) {
      return;
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsVideoOpen(false);
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isVideoOpen]);

  useEffect(() => {
    loadedRef.current = loaded;
    if (!loaded) {
      return;
    }
    paintCanvases(loaded);
  }, [loaded]);

  useEffect(() => {
    const image = loadedRef.current;
    const point = lastSamplePointRef.current;
    if (!image || !point) {
      return;
    }
    setSample(buildConvolutionSample(image.source.data, image.width, image.height, point.x, point.y, selectedFilter, sampleChannel));
  }, [sampleChannel, selectedFilter]);

  function paintCanvases(image: LoadedImage) {
    drawScratchCanvas(image);
    drawPreviewCanvas(image);
  }

  function drawScratchCanvas(image: LoadedImage) {
    const canvas = scratchRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }
    if (canvas.width !== image.width) {
      canvas.width = image.width;
    }
    if (canvas.height !== image.height) {
      canvas.height = image.height;
    }
    const composed = new ImageData(new Uint8ClampedArray(image.source.data), image.width, image.height);
    for (let i = 0; i < image.mask.length; i += 1) {
      if (image.mask[i] === 0) {
        continue;
      }
      const offset = i * 4;
      composed.data[offset] = image.result.data[offset];
      composed.data[offset + 1] = image.result.data[offset + 1];
      composed.data[offset + 2] = image.result.data[offset + 2];
    }
    ctx.putImageData(composed, 0, 0);
  }

  function drawPreviewCanvas(image: LoadedImage) {
    const canvas = previewRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }
    if (canvas.width !== image.width) {
      canvas.width = image.width;
    }
    if (canvas.height !== image.height) {
      canvas.height = image.height;
    }
    ctx.putImageData(image.result, 0, 0);
  }

  async function handleUpload(file: File | undefined) {
    if (!file) {
      return;
    }
    if (!file.type.match(/^image\/(png|jpeg|webp)$/)) {
      setError("PNG, JPEG, WebP 이미지만 사용할 수 있어요.");
      return;
    }
    try {
      const next = await loadImage(file);
      loadedRef.current = next;
      setLoaded(next);
      lastSamplePointRef.current = null;
      setSample(null);
      setFileName(file.name);
      setError("");
    } catch {
      setError("이미지를 불러오지 못했어요. 다른 파일로 다시 시도해 주세요.");
    }
  }

  function resetScratch() {
    setLoaded((current) => {
      if (!current) {
        return current;
      }
      const next = {
        ...current,
        result: new ImageData(new Uint8ClampedArray(current.source.data), current.width, current.height),
        mask: new Uint8ClampedArray(current.width * current.height),
        touchedCount: 0,
      };
      loadedRef.current = next;
      window.requestAnimationFrame(() => paintCanvases(next));
      return next;
    });
    lastSamplePointRef.current = null;
    setSample(null);
  }

  function updateKernelSize(value: number) {
    const safeSize = value % 2 === 0 ? value + 1 : value;
    const nextSize = Math.max(1, Math.min(15, safeSize));
    setKernelSize(nextSize);
    setCustomKernel((current) => {
      const resized = resizeKernel(current, nextSize);
      setCustomKernelText(resized.map((row) => row.map((value) => formatInputNumber(value))));
      return resized;
    });
    setSample(null);
  }

  function updateCustomKernel(row: number, col: number, value: string) {
    const parsed = Number(value);
    setCustomKernelText((current) => {
      const next = current.map((items) => [...items]);
      next[row][col] = value;
      return next;
    });
    setCustomKernel((current) => {
      const next = current.map((items) => [...items]);
      next[row][col] = Number.isFinite(parsed) ? parsed : 0;
      return next;
    });
    setSelectedId(customFilterId);
  }

  function getCanvasPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = scratchRef.current;
    const image = loadedRef.current;
    if (!canvas || !image) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor(((event.clientX - rect.left) / rect.width) * image.width);
    const y = Math.floor(((event.clientY - rect.top) / rect.height) * image.height);
    return {
      x: Math.max(0, Math.min(image.width - 1, x)),
      y: Math.max(0, Math.min(image.height - 1, y)),
    };
  }

  function scratchAt(x: number, y: number, filter: FilterPreset) {
    const current = loadedRef.current;
    if (!current) {
      return;
    }
    const resultData = new Uint8ClampedArray(current.result.data);
    const nextMask = new Uint8ClampedArray(current.mask);
    let touchedCount = current.touchedCount;
    const radiusSquared = brushRadius * brushRadius;

    for (let py = y - brushRadius; py <= y + brushRadius; py += 1) {
      if (py < 0 || py >= current.height) {
        continue;
      }
      for (let px = x - brushRadius; px <= x + brushRadius; px += 1) {
        if (px < 0 || px >= current.width) {
          continue;
        }
        const dx = px - x;
        const dy = py - y;
        if (dx * dx + dy * dy > radiusSquared) {
          continue;
        }
        const rgba = applyKernelToPixel(current.source.data, current.width, current.height, px, py, filter);
        const offset = (py * current.width + px) * 4;
        resultData[offset] = rgba[0];
        resultData[offset + 1] = rgba[1];
        resultData[offset + 2] = rgba[2];
        resultData[offset + 3] = rgba[3];
        const maskIndex = py * current.width + px;
        if (nextMask[maskIndex] === 0) {
          touchedCount += 1;
        }
        nextMask[maskIndex] = 1;
      }
    }

    const next = {
      ...current,
      result: new ImageData(resultData, current.width, current.height),
      mask: nextMask,
      touchedCount,
    };
    loadedRef.current = next;
    lastSamplePointRef.current = { x, y };
    setSample(buildConvolutionSample(current.source.data, current.width, current.height, x, y, filter, sampleChannel));
    paintCanvases(next);
  }

  function handlePointerDown(event: PointerEvent<HTMLCanvasElement>) {
    const point = getCanvasPoint(event);
    if (!point) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    scratchAt(point.x, point.y, selectedFilter);
  }

  function handlePointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!isDragging) {
      return;
    }
    const point = getCanvasPoint(event);
    if (point) {
      scratchAt(point.x, point.y, selectedFilter);
    }
  }

  function stopDragging() {
    setIsDragging(false);
    const current = loadedRef.current;
    if (current) {
      setLoaded(current);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">CNN 합성곱 실습</p>
          <h1>필터를 고르고 이미지 위를 긁어보세요</h1>
          <p className="creator-credit">제작: 경기이음온학교 임현우</p>
        </div>
        <div className="toolbar">
          <label className="icon-button file-button" title="이미지 업로드">
            <ImageUp size={20} />
            <span>업로드</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleUpload(event.target.files?.[0])} />
          </label>
          <button className="icon-button" type="button" onClick={resetScratch} title="초기화">
            <RotateCcw size={19} />
            <span>초기화</span>
          </button>
          <button className="icon-button video-button" type="button" onClick={() => setIsVideoOpen(true)} title="사용법 영상 보기">
            <Youtube size={20} />
            <span>사용법 영상</span>
          </button>
        </div>
      </header>

      {error ? <p className="error-text">{error}</p> : null}

      <section className="workspace">
        <aside className="filter-panel" aria-label="필터 선택">
          <div className="panel-heading">
            <h2>필터</h2>
            <p>{FILTERS.length}개 기본 커널과 직접 만든 커널</p>
          </div>
          {filterGroups.map((group) => (
            <div className="filter-group" key={group}>
              <h3>{group}</h3>
              <div className="filter-grid">
                {FILTERS.filter((filter) => filter.group === group).map((filter) => (
                  <button
                    className={`filter-card ${filter.id === selectedId ? "selected" : ""}`}
                    key={filter.id}
                    type="button"
                    onClick={() => setSelectedId(filter.id)}
                  >
                    <strong>{filter.name}</strong>
                    <span>{filter.description}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="custom-filter">
            <div>
              <h3>직접 만들기</h3>
              <p>{kernelSize}x{kernelSize} 행렬의 숫자를 바꿔 바로 실험해요.</p>
            </div>
            <div className="custom-kernel-grid" style={{ gridTemplateColumns: `repeat(${kernelSize}, minmax(0, 1fr))` }}>
              {customKernelText.map((row, rowIndex) =>
                row.map((value, colIndex) => (
                  <input
                    aria-label={`커스텀 필터 ${rowIndex + 1}행 ${colIndex + 1}열`}
                    key={`${rowIndex}-${colIndex}`}
                    type="text"
                    inputMode="decimal"
                    value={value}
                    onChange={(event) => updateCustomKernel(rowIndex, colIndex, event.target.value)}
                    onFocus={() => setSelectedId(customFilterId)}
                  />
                )),
              )}
            </div>
            <button
              className={`filter-card custom-select ${selectedId === customFilterId ? "selected" : ""}`}
              type="button"
              onClick={() => setSelectedId(customFilterId)}
            >
              <strong>내 커널 적용</strong>
              <span>정수와 소수를 섞어 실험할 수 있어요.</span>
            </button>
          </div>
        </aside>

        <section className="canvas-stage" aria-label="이미지 필터 실습">
          <div className="canvas-title">
            <div>
              <h2>{fileName}</h2>
              <p>마우스나 손가락으로 누른 채 움직이면 선택한 필터가 지나간 자리만 계산돼요.</p>
            </div>
            <span className="brush-chip">브러시 {brushRadius}px</span>
          </div>

          <div className="controls-band">
            <RangeControl
              icon={<SlidersHorizontal size={17} />}
              label="브러시 크기"
              value={brushRadius}
              min={1}
              max={42}
              step={1}
              suffix="px"
              onChange={setBrushRadius}
            />
            <RangeControl
              icon={<SlidersHorizontal size={17} />}
              label="커널 크기"
              value={kernelSize}
              min={1}
              max={15}
              step={2}
              suffix={`x${kernelSize}`}
              onChange={updateKernelSize}
            />
            <button
              className={`toggle-button ${showImageMatrix ? "active" : ""}`}
              type="button"
              onClick={() => setShowImageMatrix((current) => !current)}
            >
              <Table2 size={18} />
              <span>이미지 행렬</span>
            </button>
          </div>

          <div className="canvas-frame">
            <canvas
              ref={scratchRef}
              className="scratch-canvas"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={stopDragging}
              onPointerCancel={stopDragging}
              onPointerLeave={stopDragging}
            />
          </div>
          <div className="preview-strip">
            <div>
              <h3>전체 필터 결과</h3>
              <p>긁은 영역은 위의 큰 이미지에만 드러나요.</p>
            </div>
            <canvas ref={previewRef} className="preview-canvas" />
          </div>
          {showImageMatrix && loaded ? <ImageMatrixPanel image={loaded} paused={isDragging} /> : null}
        </section>

        <aside className="calc-panel" aria-label="합성곱 계산">
          <div className="panel-heading">
            <h2>{kernelSize}x{kernelSize} 계산</h2>
            <p>{sample ? `중심 픽셀 (${sample.x}, ${sample.y})` : "이미지를 긁으면 값이 나타나요"}</p>
          </div>
          <div className="channel-tabs" aria-label="계산 채널 선택">
            {channelOptions.map((channel) => (
              <button
                className={sampleChannel === channel.id ? "active" : ""}
                key={channel.id}
                type="button"
                title={channel.description}
                onClick={() => setSampleChannel(channel.id)}
              >
                {channel.label}
              </button>
            ))}
          </div>
          <Matrix title={`원본 ${channelLabel(sampleChannel)} 값`} matrix={sample?.sourceValues} fallbackSize={kernelSize} />
          <Matrix
            title={selectedFilter.name}
            matrix={sample?.displayKernel ?? getDisplayKernel(selectedFilter)}
            fallbackSize={kernelSize}
          />
          <Matrix title="자리별 곱셈" matrix={sample?.multiplied} fallbackSize={kernelSize} />
          <div className="result-box">
            <span>합산</span>
            <strong>{sample ? formatNumber(sample.sum) : "-"}</strong>
          </div>
          <div className="result-box accent">
            <span>최종 {channelLabel(sampleChannel)} 값</span>
            <strong>{sample ? sample.outputValue : "-"}</strong>
          </div>
          <p className="calc-note">
            실제 이미지는 R, G, B 채널마다 같은 커널을 따로 적용해요. 밝기 탭은 설명용 흑백 요약이에요.
          </p>
        </aside>
      </section>
      {isVideoOpen ? <VideoModal onClose={() => setIsVideoOpen(false)} /> : null}
    </main>
  );
}

function VideoModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="video-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-label="CNN 필터 실습 사용법 영상"
        aria-modal="true"
        className="video-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="video-modal-header">
          <button className="close-button" type="button" onClick={onClose} title="닫기">
            <X size={22} />
          </button>
        </div>
        <div className="youtube-frame">
          <iframe
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            src="https://www.youtube.com/embed/TtS4effB-mU?rel=0"
            title="CNN 필터 실습 사용법 영상"
          />
        </div>
      </section>
    </div>
  );
}

function RangeControl({
  icon,
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-control">
      <span>
        {icon}
        {label}
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <strong>{value}{suffix}</strong>
    </label>
  );
}

function Matrix({ title, matrix, fallbackSize, suffix = "" }: { title: string; matrix?: number[][]; fallbackSize: number; suffix?: string }) {
  const visibleMatrix = matrix ?? createEmptyKernel(fallbackSize).map((row) => row.map(() => Number.NaN));
  return (
    <div className="matrix-block">
      <h3>{title}{suffix}</h3>
      <div className="matrix" style={{ gridTemplateColumns: `repeat(${visibleMatrix.length}, minmax(0, 1fr))` }}>
        {visibleMatrix.map((row, rowIndex) =>
          row.map((value, colIndex) => (
            <span key={`${rowIndex}-${colIndex}`}>{Number.isFinite(value) ? formatNumber(value) : "-"}</span>
          )),
        )}
      </div>
    </div>
  );
}

function ImageMatrixPanel({ image, paused }: { image: LoadedImage; paused: boolean }) {
  const lastRowsRef = useRef<MatrixCell[][]>([]);
  const rows = useMemo(() => {
    if (paused) {
      return lastRowsRef.current;
    }
    const nextRows = buildImageMatrix(image);
    lastRowsRef.current = nextRows;
    return nextRows;
  }, [image, paused]);
  const touchedPercent = ((image.touchedCount / image.mask.length) * 100).toFixed(1);
  return (
    <section className={`image-matrix-panel ${paused ? "paused" : ""}`} aria-label="전체 이미지 행렬 변화">
      {paused ? (
        <div className="image-matrix-blank" />
      ) : (
        <>
          <div className="matrix-panel-title">
            <div>
              <h3>전체 이미지 행렬 보기</h3>
              <p>대표 좌표의 밝기 변화를 원본 → 결과로 보여줘요.</p>
            </div>
            <span>{touchedPercent}% 변경</span>
          </div>
          <div className="image-matrix-scroll">
            <div className="image-matrix-grid" style={{ gridTemplateColumns: `repeat(${rows[0]?.length ?? 1}, minmax(52px, 1fr))` }}>
              {rows.flat().map((cell) => (
                <div
                  className={`image-matrix-cell ${cell.touched ? "changed" : ""}`}
                  key={`${cell.x}-${cell.y}`}
                  title={`x:${cell.x}, y:${cell.y}`}
                >
                  <span>{cell.source}</span>
                  <strong>{cell.result}</strong>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function buildImageMatrix(image: LoadedImage): MatrixCell[][] {
  const columns = Math.min(18, Math.max(6, Math.round(image.width / 48)));
  const rows = Math.min(10, Math.max(5, Math.round(image.height / 48)));

  return Array.from({ length: rows }, (_, rowIndex) =>
    Array.from({ length: columns }, (_, colIndex) => {
      const x = Math.min(image.width - 1, Math.round((colIndex / Math.max(1, columns - 1)) * (image.width - 1)));
      const y = Math.min(image.height - 1, Math.round((rowIndex / Math.max(1, rows - 1)) * (image.height - 1)));
      const offset = (y * image.width + x) * 4;
      const source = rgbaToGray([
        image.source.data[offset],
        image.source.data[offset + 1],
        image.source.data[offset + 2],
        image.source.data[offset + 3],
      ]);
      const result = rgbaToGray([
        image.result.data[offset],
        image.result.data[offset + 1],
        image.result.data[offset + 2],
        image.result.data[offset + 3],
      ]);
      return {
        x,
        y,
        source,
        result,
        touched: image.mask[y * image.width + x] === 1,
      };
    }),
  );
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(3).replace(/\.?0+$/, "");
}

function formatInputNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

function channelLabel(channel: SampleChannel) {
  if (channel === "r") {
    return "R";
  }
  if (channel === "g") {
    return "G";
  }
  if (channel === "b") {
    return "B";
  }
  return "밝기";
}

function getDisplayKernel(filter: FilterPreset) {
  const divisor = filter.divisor ?? 1;
  return filter.kernel.map((row) => row.map((value) => value / divisor));
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
