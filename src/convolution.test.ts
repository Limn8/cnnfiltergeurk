import { describe, expect, it } from "vitest";
import { applyKernelToPixel, buildConvolutionSample, clampByte, getPixel } from "./convolution";
import type { FilterPreset } from "./filters";

const identity: FilterPreset = {
  id: "identity",
  name: "identity",
  group: "기본",
  description: "",
  kernel: [
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 0],
  ],
};

const blur: FilterPreset = {
  id: "blur",
  name: "blur",
  group: "흐림",
  description: "",
  kernel: [
    [1, 1, 1],
    [1, 1, 1],
    [1, 1, 1],
  ],
  divisor: 9,
};

describe("convolution", () => {
  it("clamps bytes to the displayable image range", () => {
    expect(clampByte(-20)).toBe(0);
    expect(clampByte(128.4)).toBe(128);
    expect(clampByte(999)).toBe(255);
  });

  it("samples edge pixels by clamping coordinates", () => {
    const data = new Uint8ClampedArray([10, 20, 30, 255, 90, 100, 110, 255]);
    expect(getPixel(data, 2, 1, -5, 0)).toEqual([10, 20, 30, 255]);
    expect(getPixel(data, 2, 1, 5, 0)).toEqual([90, 100, 110, 255]);
  });

  it("keeps the center pixel with an identity kernel", () => {
    const data = new Uint8ClampedArray([
      1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255,
      10, 11, 12, 255, 100, 120, 140, 255, 16, 17, 18, 255,
      19, 20, 21, 255, 22, 23, 24, 255, 25, 26, 27, 255,
    ]);
    expect(applyKernelToPixel(data, 3, 3, 1, 1, identity)).toEqual([100, 120, 140, 255]);
  });

  it("applies divisors for average blur", () => {
    const data = new Uint8ClampedArray(Array.from({ length: 9 }, (_, i) => [i * 10, i * 10, i * 10, 255]).flat());
    expect(applyKernelToPixel(data, 3, 3, 1, 1, blur)).toEqual([40, 40, 40, 255]);
  });

  it("builds a grayscale explanation sample", () => {
    const data = new Uint8ClampedArray(Array.from({ length: 9 }, () => [100, 100, 100, 255]).flat());
    const sample = buildConvolutionSample(data, 3, 3, 1, 1, identity);
    expect(sample.sourceValues[1][1]).toBe(100);
    expect(sample.sum).toBe(100);
    expect(sample.outputValue).toBe(100);
  });

  it("builds samples for a specific color channel", () => {
    const data = new Uint8ClampedArray(Array.from({ length: 9 }, () => [30, 90, 150, 255]).flat());
    const sample = buildConvolutionSample(data, 3, 3, 1, 1, identity, "b");
    expect(sample.sourceValues[1][1]).toBe(150);
    expect(sample.outputValue).toBe(150);
  });
});
