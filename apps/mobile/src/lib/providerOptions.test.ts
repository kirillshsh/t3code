import { describe, expect, it } from "vite-plus/test";

import type { ModelCapabilities } from "@t3tools/contracts";

import {
  applyProviderOptionSelection,
  providerOptionValueLabels,
  reasoningValueLabel,
  resolveProviderOptionDescriptors,
} from "./providerOptions";

const CODEX_CAPABILITIES: ModelCapabilities = {
  optionDescriptors: [
    {
      id: "reasoningEffort",
      label: "Reasoning",
      type: "select",
      options: [
        { id: "medium", label: "Medium", isDefault: true },
        { id: "high", label: "High" },
      ],
      currentValue: "medium",
    },
    {
      id: "serviceTier",
      label: "Service Tier",
      type: "select",
      options: [
        { id: "default", label: "Standard", isDefault: true },
        { id: "priority", label: "Fast" },
      ],
      currentValue: "default",
    },
  ],
};

describe("mobile provider options", () => {
  it("summarizes the option values currently in effect", () => {
    const descriptors = resolveProviderOptionDescriptors({
      capabilities: CODEX_CAPABILITIES,
      selections: undefined,
    });

    expect(providerOptionValueLabels(descriptors)).toEqual(["Medium", "Standard"]);
  });

  it("updates generic select options without knowing provider-specific ids", () => {
    const descriptors = resolveProviderOptionDescriptors({
      capabilities: CODEX_CAPABILITIES,
      selections: undefined,
    });

    expect(
      applyProviderOptionSelection(descriptors, { id: "serviceTier", value: "priority" }),
    ).toEqual([
      { id: "reasoningEffort", value: "medium" },
      { id: "serviceTier", value: "priority" },
    ]);
    // Choices the model doesn't advertise are rejected, not stored.
    expect(
      applyProviderOptionSelection(descriptors, { id: "serviceTier", value: "turbo" }),
    ).toBeNull();
    expect(applyProviderOptionSelection(descriptors, { id: "unknown", value: "high" })).toBeNull();
  });

  it("picks the reasoning level out of the provider's own select id", () => {
    expect(
      reasoningValueLabel(
        resolveProviderOptionDescriptors({
          capabilities: CODEX_CAPABILITIES,
          selections: [{ id: "reasoningEffort", value: "high" }],
        }),
      ),
    ).toBe("High");
    // Models without a reasoning select just don't show one.
    expect(
      reasoningValueLabel(
        resolveProviderOptionDescriptors({
          capabilities: { optionDescriptors: [{ id: "fastMode", label: "Fast", type: "boolean" }] },
          selections: undefined,
        }),
      ),
    ).toBeUndefined();
  });

  it("treats an unspecified boolean capability as off", () => {
    const descriptors = resolveProviderOptionDescriptors({
      capabilities: {
        optionDescriptors: [{ id: "fastMode", label: "Fast Mode", type: "boolean" }],
      },
      selections: undefined,
    });

    expect(providerOptionValueLabels(descriptors)).toEqual([]);
    expect(applyProviderOptionSelection(descriptors, { id: "fastMode", value: true })).toEqual([
      { id: "fastMode", value: true },
    ]);
  });
});
