import type { FilterPreset, Kernel } from "./filters";

export type Rgba = [number, number, number, number];
export type SampleChannel = "gray" | "r" | "g" | "b";

export type ConvolutionSample = {
  x: number;
  y: number;
  channel: SampleChannel;
  sourceValues: Kernel;
  displayKernel: Kernel;
  multiplied: Kernel;
  sum: number;
  normalized: number;
  outputValue: number;
};

const channelCount = 4;

export function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function rgbaToGray([r, g, b]: Rgba): number {
  return Math.round(0.299 * r + 0.587 * g + 0.114 * b);
}

export function getPixel(data: Uint8ClampedArray, width: number, height: number, x: number, y: number): Rgba {
  const safeX = Math.max(0, Math.min(width - 1, x));
  const safeY = Math.max(0, Math.min(height - 1, y));
  const index = (safeY * width + safeX) * channelCount;
  return [data[index], data[index + 1], data[index + 2], data[index + 3]];
}

export function applyKernelToPixel(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  filter: FilterPreset,
): Rgba {
  const sums = [0, 0, 0];
  const kernelSize = filter.kernel.length;
  const half = Math.floor(kernelSize / 2);

  for (let ky = 0; ky < kernelSize; ky += 1) {
    for (let kx = 0; kx < kernelSize; kx += 1) {
      const pixel = getPixel(data, width, height, x + kx - half, y + ky - half);
      const weight = filter.kernel[ky][kx];
      sums[0] += pixel[0] * weight;
      sums[1] += pixel[1] * weight;
      sums[2] += pixel[2] * weight;
    }
  }

  const divisor = filter.divisor ?? 1;
  const offset = filter.offset ?? 0;
  const alpha = getPixel(data, width, height, x, y)[3];

  return [
    clampByte(sums[0] / divisor + offset),
    clampByte(sums[1] / divisor + offset),
    clampByte(sums[2] / divisor + offset),
    alpha,
  ];
}

export function buildConvolutionSample(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number,
  filter: FilterPreset,
  channel: SampleChannel = "gray",
): ConvolutionSample {
  const kernelSize = filter.kernel.length;
  const half = Math.floor(kernelSize / 2);
  const sourceValues = emptyKernel(kernelSize);
  const displayKernel = emptyKernel(kernelSize);
  const multiplied = emptyKernel(kernelSize);
  let sum = 0;
  const divisor = filter.divisor ?? 1;

  for (let ky = 0; ky < kernelSize; ky += 1) {
    for (let kx = 0; kx < kernelSize; kx += 1) {
      const value = getChannelValue(getPixel(data, width, height, x + kx - half, y + ky - half), channel);
      const displayWeight = filter.kernel[ky][kx] / divisor;
      const product = value * displayWeight;
      displayKernel[ky][kx] = displayWeight;
      sourceValues[ky][kx] = value;
      multiplied[ky][kx] = product;
      sum += product;
    }
  }

  const normalized = sum + (filter.offset ?? 0);

  return {
    x,
    y,
    channel,
    sourceValues,
    displayKernel,
    multiplied,
    sum,
    normalized,
    outputValue: clampByte(normalized),
  };
}

function getChannelValue(pixel: Rgba, channel: SampleChannel): number {
  if (channel === "r") {
    return pixel[0];
  }
  if (channel === "g") {
    return pixel[1];
  }
  if (channel === "b") {
    return pixel[2];
  }
  return rgbaToGray(pixel);
}

function emptyKernel(size: number): Kernel {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
}
