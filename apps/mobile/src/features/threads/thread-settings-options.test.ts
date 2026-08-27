import type { ProviderOptionDescriptor } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  canRenderChoiceSegments,
  choiceDescription,
  segmentChoiceLabel,
  selectableChoices,
} from "./thread-settings-options";

const effortDescriptor: Extract<ProviderOptionDescriptor, { type: "select" }> = {
  id: "effort",
  label: "Reasoning",
  type: "select",
  options: [
    { id: "low", label: "Low" },
    { id: "medium", label: "Medium", isDefault: true },
    { id: "high", label: "High" },
    { id: "ultrathink", label: "Ultrathink" },
    { id: "ultracode", label: "Ultracode" },
  ],
  currentValue: "high",
  promptInjectedValues: ["ultrathink"],
};

describe("selectableChoices", () => {
  it("hides prompt-injected and workflow-trigger choices, keeping declared order", () => {
    expect(selectableChoices(effortDescriptor).map((choice) => choice.id)).toEqual([
      "low",
      "medium",
      "high",
    ]);
  });
});

describe("canRenderChoiceSegments", () => {
  it("segments a short choice set with short labels", () => {
    expect(canRenderChoiceSegments(selectableChoices(effortDescriptor))).toBe(true);
    expect(
      canRenderChoiceSegments([
        { id: "200k", label: "200k" },
        { id: "1m", label: "1M" },
      ]),
    ).toBe(true);
  });

  it("keeps a disclosure row for long catalogs, long labels and single choices", () => {
    expect(
      canRenderChoiceSegments(
        Array.from({ length: 6 }, (_, index) => ({ id: `${index}`, label: `L${index}` })),
      ),
    ).toBe(false);
    expect(
      canRenderChoiceSegments([
        { id: "standard", label: "Standard" },
        { id: "priority", label: "Priority processing" },
      ]),
    ).toBe(false);
    expect(canRenderChoiceSegments([{ id: "only", label: "Only" }])).toBe(false);
  });

  it("measures the shortened label, so Extra High still fits", () => {
    expect(segmentChoiceLabel("Extra High")).toBe("X-High");
    expect(
      canRenderChoiceSegments([
        { id: "high", label: "High" },
        { id: "xhigh", label: "Extra High" },
        { id: "max", label: "Max" },
      ]),
    ).toBe(true);
  });
});

describe("choiceDescription", () => {
  it("explains reasoning levels the provider ships without prose", () => {
    expect(choiceDescription(effortDescriptor, "high")).toBe("Balanced depth for everyday work.");
  });

  it("prefers the provider's own description", () => {
    expect(
      choiceDescription(
        {
          ...effortDescriptor,
          options: [{ id: "high", label: "High", description: "Provider copy." }],
        },
        "high",
      ),
    ).toBe("Provider copy.");
  });

  it("has nothing to say about unrelated selects or missing values", () => {
    expect(
      choiceDescription(
        {
          id: "contextWindow",
          label: "Context Window",
          type: "select",
          options: [{ id: "1m", label: "1M" }],
        },
        "1m",
      ),
    ).toBeUndefined();
    expect(choiceDescription(effortDescriptor, undefined)).toBeUndefined();
  });
});
