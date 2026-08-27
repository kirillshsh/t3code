import type {
  ProviderOptionChoice,
  ProviderOptionDescriptor,
  RuntimeMode,
} from "@t3tools/contracts";

import { REASONING_DESCRIPTOR_IDS } from "../../lib/providerOptions";

/**
 * Desktop-oriented effort keywords that don't belong in the phone picker.
 * Prompt-injected values (ultrathink and friends) are filtered from the
 * descriptor metadata; ultracode is a real option but a workflow trigger, not
 * a reasoning level. A value set elsewhere still displays, it just isn't
 * offered.
 */
const HIDDEN_EFFORT_OPTION_IDS: ReadonlySet<string> = new Set(["ultracode"]);

export const RUNTIME_MODE_CHOICES: ReadonlyArray<{
  readonly mode: RuntimeMode;
  readonly label: string;
  readonly description: string;
}> = [
  {
    mode: "approval-required",
    label: "Supervised",
    description: "Ask before commands and file changes.",
  },
  {
    mode: "auto-accept-edits",
    label: "Auto-accept edits",
    description: "Auto-approve edits, ask before other actions.",
  },
  {
    mode: "auto",
    label: "Auto",
    description: "Supported providers approve routine actions; others still ask.",
  },
  {
    mode: "full-access",
    label: "Full access",
    description: "Allow commands and edits without prompts.",
  },
];

export function selectableChoices(
  descriptor: Extract<ProviderOptionDescriptor, { type: "select" }>,
) {
  const injected = new Set(descriptor.promptInjectedValues ?? []);
  return descriptor.options.filter(
    (option) => !injected.has(option.id) && !HIDDEN_EFFORT_OPTION_IDS.has(option.id),
  );
}

/**
 * Long provider labels that need a shorter form to survive a segment barely
 * wider than a thumb. Anything absent stays as the provider wrote it.
 */
const SEGMENT_LABEL_OVERRIDES: Readonly<Record<string, string>> = {
  "Extra High": "X-High",
  "Extra high": "X-High",
};

export function segmentChoiceLabel(label: string): string {
  return SEGMENT_LABEL_OVERRIDES[label] ?? label;
}

/** Widest label a five-up segmented row can show without shrinking the text. */
const MAX_SEGMENT_LABEL_LENGTH = 8;
const MAX_SEGMENT_COUNT = 5;

/**
 * A short, closed set of choices reads better as segments than as a row that
 * pushes a whole screen to change one word. Longer catalogs (OpenRouter-style
 * option lists) keep the disclosure row.
 */
export function canRenderChoiceSegments(choices: ReadonlyArray<ProviderOptionChoice>): boolean {
  return (
    choices.length >= 2 &&
    choices.length <= MAX_SEGMENT_COUNT &&
    choices.every((choice) => segmentChoiceLabel(choice.label).length <= MAX_SEGMENT_LABEL_LENGTH)
  );
}

/**
 * Providers ship reasoning levels as bare ids, so the picker carries its own
 * one-line explanation of the selected level. A description from the provider
 * always wins.
 */
const REASONING_LEVEL_DESCRIPTIONS: Readonly<Record<string, string>> = {
  low: "Answers quickly with little deliberation.",
  medium: "Some deliberation before acting.",
  high: "Balanced depth for everyday work.",
  xhigh: "Thinks longer on hard problems.",
  max: "Deliberates the longest, and starts the slowest.",
};

export function choiceDescription(
  descriptor: Extract<ProviderOptionDescriptor, { type: "select" }>,
  choiceId: string | undefined,
): string | undefined {
  if (choiceId === undefined) {
    return undefined;
  }
  const provided = descriptor.options.find((option) => option.id === choiceId)?.description;
  if (provided) {
    return provided;
  }
  return REASONING_DESCRIPTOR_IDS.has(descriptor.id)
    ? REASONING_LEVEL_DESCRIPTIONS[choiceId]
    : undefined;
}
