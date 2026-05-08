export type FilterGroup = "기본" | "흐림" | "윤곽/선" | "효과" | "커스텀";

export type Kernel = number[][];

export type FilterPreset = {
  id: string;
  name: string;
  group: FilterGroup;
  description: string;
  kernel: Kernel;
  divisor?: number;
  offset?: number;
};

export const scalableFilterIds = new Set([
  "edge-basic",
  "sharpen",
  "box-blur",
  "gaussian",
  "sobel-x",
  "sobel-y",
  "edge-strong",
  "outline",
  "emboss",
  "emboss-bright",
  "motion-blur",
  "center-pop",
  "dark-rim",
  "laplacian",
]);

export const FILTERS: FilterPreset[] = [
  {
    id: "edge-basic",
    name: "엣지 검출",
    group: "기본",
    description: "수직 경계가 도장처럼 또렷해져요.",
    kernel: [
      [1, 0, -1],
      [1, 0, -1],
      [1, 0, -1],
    ],
  },
  {
    id: "sharpen",
    name: "샤프닝",
    group: "기본",
    description: "윤곽과 글자가 더 단단하게 살아나요.",
    kernel: [
      [0, -1, 0],
      [-1, 5, -1],
      [0, -1, 0],
    ],
  },
  {
    id: "box-blur",
    name: "블러",
    group: "흐림",
    description: "사진을 부드럽게 뭉개 노이즈를 줄여요.",
    kernel: [
      [1, 1, 1],
      [1, 1, 1],
      [1, 1, 1],
    ],
    divisor: 9,
  },
  {
    id: "gaussian",
    name: "가우시안",
    group: "흐림",
    description: "가운데를 더 믿는 자연스러운 흐림이에요.",
    kernel: [
      [1, 2, 1],
      [2, 4, 2],
      [1, 2, 1],
    ],
    divisor: 16,
  },
  {
    id: "sobel-x",
    name: "세로선 Sobel",
    group: "윤곽/선",
    description: "건물 기둥이나 얼굴 옆선을 잘 잡아요.",
    kernel: [
      [-1, 0, 1],
      [-2, 0, 2],
      [-1, 0, 1],
    ],
  },
  {
    id: "sobel-y",
    name: "가로선 Sobel",
    group: "윤곽/선",
    description: "눈썹, 지평선, 책상 모서리가 튀어나와요.",
    kernel: [
      [-1, -2, -1],
      [0, 0, 0],
      [1, 2, 1],
    ],
  },
  {
    id: "edge-strong",
    name: "강한 경계",
    group: "윤곽/선",
    description: "윤곽만 남기고 나머지는 확 줄여요.",
    kernel: [
      [-1, -1, -1],
      [-1, 8, -1],
      [-1, -1, -1],
    ],
  },
  {
    id: "outline",
    name: "외곽선",
    group: "윤곽/선",
    description: "만화 펜선처럼 테두리를 찾아요.",
    kernel: [
      [0, 1, 0],
      [1, -4, 1],
      [0, 1, 0],
    ],
  },
  {
    id: "emboss",
    name: "엠보싱",
    group: "효과",
    description: "종이에 눌러 찍은 듯한 입체감이 생겨요.",
    kernel: [
      [-2, -1, 0],
      [-1, 1, 1],
      [0, 1, 2],
    ],
  },
  {
    id: "emboss-bright",
    name: "밝은 엠보싱",
    group: "효과",
    description: "회색 바탕 위에 양각처럼 보여요.",
    kernel: [
      [-1, -1, 0],
      [-1, 0, 1],
      [0, 1, 1],
    ],
    offset: 128,
  },
  {
    id: "motion-blur",
    name: "모션 블러",
    group: "흐림",
    description: "대각선으로 빠르게 지나간 느낌을 만들어요.",
    kernel: [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ],
    divisor: 3,
  },
  {
    id: "center-pop",
    name: "중심 강조",
    group: "효과",
    description: "가운데 픽셀의 영향이 더 크게 보이게 해요.",
    kernel: [
      [0, -0.5, 0],
      [-0.5, 3, -0.5],
      [0, -0.5, 0],
    ],
  },
  {
    id: "dark-rim",
    name: "어두운 테두리",
    group: "효과",
    description: "밝고 어두운 차이를 과감하게 뒤집어요.",
    kernel: [
      [1, 1, 1],
      [1, -7, 1],
      [1, 1, 1],
    ],
  },
  {
    id: "laplacian",
    name: "반전 경계",
    group: "윤곽/선",
    description: "가느다란 경계 반응을 비교하기 좋아요.",
    kernel: [
      [0, -1, 0],
      [-1, 4, -1],
      [0, -1, 0],
    ],
  },
];

export const filterGroups: FilterGroup[] = ["기본", "흐림", "윤곽/선", "효과"];

export function createEmptyKernel(size: number): Kernel {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
}

export function resizeKernel(kernel: Kernel, size: number): Kernel {
  const next = createEmptyKernel(size);
  const oldCenter = Math.floor(kernel.length / 2);
  const newCenter = Math.floor(size / 2);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const oldY = y - newCenter + oldCenter;
      const oldX = x - newCenter + oldCenter;
      if (kernel[oldY]?.[oldX] !== undefined) {
        next[y][x] = kernel[oldY][oldX];
      }
    }
  }

  return next;
}

export function materializeFilter(filter: FilterPreset, kernelSize: number): FilterPreset {
  if (!scalableFilterIds.has(filter.id) || kernelSize === 3) {
    return filter;
  }

  const generated = generateKernel(filter.id, kernelSize);
  return {
    ...filter,
    ...generated,
    description: `${filter.description} 커널 ${kernelSize}x${kernelSize}로 실험 중이에요.`,
  };
}

function generateKernel(id: string, size: number): Pick<FilterPreset, "kernel" | "divisor" | "offset"> {
  switch (id) {
    case "box-blur":
      return { kernel: filled(size, 1), divisor: size * size };
    case "gaussian":
      return gaussian(size);
    case "sharpen":
      return sharpen(size);
    case "edge-basic":
    case "sobel-x":
      return verticalEdge(size);
    case "sobel-y":
      return horizontalEdge(size);
    case "edge-strong":
    case "dark-rim":
      return allAroundEdge(size, id === "dark-rim" ? -1 : 1);
    case "outline":
    case "laplacian":
      return crossEdge(size);
    case "emboss":
      return emboss(size, 0);
    case "emboss-bright":
      return emboss(size, 128);
    case "motion-blur":
      return motionBlur(size);
    case "center-pop":
      return centerPop(size);
    default:
      return { kernel: filled(size, 0) };
  }
}

function filled(size: number, value: number): Kernel {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => value));
}

function linspace(start: number, end: number, size: number): number[] {
  if (size === 1) {
    return [0];
  }
  return Array.from({ length: size }, (_, index) => start + ((end - start) * index) / (size - 1));
}

function gaussian(size: number): Pick<FilterPreset, "kernel" | "divisor"> {
  const row = pascalRow(size - 1);
  const kernel = row.map((y) => row.map((x) => x * y));
  const divisor = kernel.flat().reduce((sum, value) => sum + value, 0);
  return { kernel, divisor };
}

function pascalRow(power: number): number[] {
  const row = [1];
  for (let i = 0; i < power; i += 1) {
    row.unshift(0);
    for (let j = 0; j < row.length - 1; j += 1) {
      row[j] += row[j + 1];
    }
  }
  return row;
}

function sharpen(size: number): Pick<FilterPreset, "kernel"> {
  const weakNegative = -1 / (size * size);
  const kernel = filled(size, weakNegative);
  const center = Math.floor(size / 2);
  kernel[center][center] = 2 - 1 / (size * size);
  return { kernel };
}

function verticalEdge(size: number): Pick<FilterPreset, "kernel"> {
  const row = linspace(-1, 1, size);
  return { kernel: Array.from({ length: size }, () => [...row]) };
}

function horizontalEdge(size: number): Pick<FilterPreset, "kernel"> {
  const values = linspace(-1, 1, size);
  return { kernel: values.map((value) => Array.from({ length: size }, () => value)) };
}

function allAroundEdge(size: number, sign: number): Pick<FilterPreset, "kernel"> {
  const kernel = filled(size, -sign);
  const center = Math.floor(size / 2);
  kernel[center][center] = sign * (size * size - 1);
  return { kernel };
}

function crossEdge(size: number): Pick<FilterPreset, "kernel"> {
  const kernel = filled(size, 0);
  const center = Math.floor(size / 2);
  for (let i = 0; i < size; i += 1) {
    if (i !== center) {
      kernel[center][i] = -1;
      kernel[i][center] = -1;
    }
  }
  kernel[center][center] = (size - 1) * 2;
  return { kernel };
}

function emboss(size: number, offset: number): Pick<FilterPreset, "kernel" | "offset"> {
  const kernel = filled(size, 0);
  const center = Math.floor(size / 2);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      kernel[y][x] = Math.max(-2, Math.min(2, x + y - center * 2));
    }
  }
  return { kernel, offset };
}

function motionBlur(size: number): Pick<FilterPreset, "kernel" | "divisor"> {
  const kernel = filled(size, 0);
  for (let i = 0; i < size; i += 1) {
    kernel[i][i] = 1;
  }
  return { kernel, divisor: size };
}

function centerPop(size: number): Pick<FilterPreset, "kernel"> {
  const kernel = filled(size, -0.5 / Math.max(1, size - 1));
  const center = Math.floor(size / 2);
  kernel[center][center] = 3;
  return { kernel };
}
