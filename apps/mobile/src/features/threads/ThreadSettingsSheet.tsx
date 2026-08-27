import type {
  ModelSelection,
  ProviderOptionChoice,
  ProviderOptionDescriptor,
  ProviderOptionSelection,
  RuntimeMode,
} from "@t3tools/contracts";
import type { LegendListRenderItemProps } from "@legendapp/list/react-native";
import { AnimatedLegendList } from "@legendapp/list/reanimated";
import { HeaderHeightContext } from "@react-navigation/elements";
import {
  getProviderOptionCurrentLabel,
  getProviderOptionCurrentValue,
} from "@t3tools/shared/model";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import {
  createNativeStackNavigator,
  type NativeStackNavigationProp,
} from "@react-navigation/native-stack";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeOut, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { AndroidScreenHeader } from "../../components/AndroidScreenHeader";
import { ProviderIcon } from "../../components/ProviderIcon";
import { ThemedSwitch } from "../../components/ThemedSwitch";
import { cn } from "../../lib/cn";
import {
  modelCapabilitySummary,
  type ModelOption,
  type ProviderGroup,
} from "../../lib/modelOptions";
import { applyProviderOptionSelection } from "../../lib/providerOptions";
import { resolveProviderOptionDescriptors } from "../../lib/providerOptions";
import { useThemeColor } from "../../lib/useThemeColor";
import {
  NativeHeaderToolbar,
  NativeStackScreenOptions,
  nativeHeaderScrollEdgeEffects,
} from "../../native/StackHeader";
import { NATIVE_LIQUID_GLASS_SUPPORTED } from "../../native/native-glass";
import { useNewTaskFlow } from "./new-task-flow-provider";
import {
  createNativeMailSearchToolbarItem,
  NATIVE_MAIL_SEARCH_TOOLBAR_CONTENT_INSET,
  NATIVE_MAIL_SEARCH_TOOLBAR_SUPPORTED,
} from "../layout/native-mail-search-toolbar";
import {
  canRenderChoiceSegments,
  choiceDescription,
  RUNTIME_MODE_CHOICES,
  segmentChoiceLabel,
  selectableChoices,
} from "./thread-settings-options";
import {
  modelMatchesCatalogQuery,
  providerSectionIsCollapsed,
} from "./thread-settings-sheet-state";
import { hapticSelection } from "../../lib/haptics";

/**
 * Everyday harnesses start expanded; every other provider (OpenRouter catalogs
 * and friends) starts folded so a 300-model catalog cannot bury the list. All
 * provider headers remain user-collapsible.
 */
const PRIMARY_PROVIDER_DRIVERS: ReadonlySet<string> = new Set(["claudeAgent", "codex"]);
/**
 * Keep measured row changes stable, but let catalog mutations use the list's
 * native bounds so a filtered catalog that underflows returns to the top.
 */
const THREAD_SETTINGS_MAINTAIN_VISIBLE_CONTENT_POSITION = {
  data: false,
  size: true,
} as const;
const THREAD_SETTINGS_CATALOG_LAYOUT_TRANSITION = LinearTransition.duration(180);
const THREAD_SETTINGS_CATALOG_ENTER_TRANSITION = FadeIn.duration(140);
const THREAD_SETTINGS_CATALOG_EXIT_TRANSITION = FadeOut.duration(120);
const THREAD_SETTINGS_OPTIONS_LAYOUT_TRANSITION = LinearTransition.duration(180);
const THREAD_SETTINGS_HEADER_SCROLL_EDGE_EFFECTS = nativeHeaderScrollEdgeEffects(
  Platform.OS,
  Platform.Version,
);

/** Section caption above a settings card. */
function SectionLabel(props: { readonly title: string; readonly className?: string }) {
  return (
    <Text
      className={cn("px-5 pb-2 pt-2 text-sm font-t3-medium text-foreground-muted", props.className)}
    >
      {props.title}
    </Text>
  );
}

function ModelRow(props: {
  readonly option: ModelOption;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly isFirst: boolean;
  readonly isLast: boolean;
}) {
  const checkmarkColor = useThemeColor("--color-icon");
  // What the model brings — its option levers and context size — so the pick
  // is informed before the summary screen shows the same levers.
  const summary = useMemo(() => modelCapabilitySummary(props.option), [props.option]);
  return (
    <Pressable
      accessibilityLabel={props.option.label}
      accessibilityRole="radio"
      accessibilityState={{ checked: props.selected }}
      onPress={props.onPress}
      className={cn(
        "mx-4 min-h-[52px] flex-row items-center gap-2 px-4 py-2 active:bg-subtle-strong",
        // The checkmark alone was the only mark of the current model; a quiet
        // fill carries it at a glance without an inverted, shouting row.
        props.selected ? "bg-subtle-strong" : "bg-card",
        props.isFirst && "rounded-t-[20px]",
        props.isLast ? "rounded-b-[20px]" : "border-b border-border-subtle",
      )}
    >
      <View className="min-w-0 shrink gap-0.5">
        <View className="flex-row items-center gap-2">
          <Text
            className="min-w-0 shrink text-base font-t3-medium text-foreground"
            numberOfLines={1}
          >
            {props.option.label}
          </Text>
          {props.option.isDefault ? (
            <View className="rounded-md bg-subtle-strong px-1.5 py-0.5">
              <Text className="text-3xs font-t3-bold text-foreground-muted">Default</Text>
            </View>
          ) : null}
          {props.option.isLegacy ? (
            <View className="rounded-md bg-subtle px-1.5 py-0.5">
              <Text className="text-3xs font-t3-bold text-foreground-muted">Legacy</Text>
            </View>
          ) : null}
        </View>
        {summary ? (
          <Text className="text-xs text-foreground-tertiary" numberOfLines={1}>
            {summary}
          </Text>
        ) : null}
      </View>
      <View className="flex-1" />
      {props.selected ? (
        <SymbolView
          name="checkmark"
          size={16}
          tintColor={checkmarkColor}
          type="monochrome"
          weight="semibold"
        />
      ) : null}
    </Pressable>
  );
}

/** Provider catalog header with its harness logo and disclosure state. */
function ProviderHeader(props: {
  readonly driver: string | undefined;
  readonly label: string;
  readonly collapsible: boolean;
  readonly collapsed: boolean;
  readonly modelCount: number;
  readonly onToggle: () => void;
}) {
  const iconSubtle = useThemeColor("--color-icon-subtle");
  const content = (
    <>
      <ProviderIcon provider={props.driver} size={15} />
      <Text className="text-sm font-t3-medium text-foreground-muted">{props.label}</Text>
      {props.collapsible ? (
        <>
          <View className="flex-1" />
          {props.collapsed ? (
            <Text className="text-2xs font-t3-medium text-foreground-muted">
              {props.modelCount}
            </Text>
          ) : null}
          <SymbolView
            name={props.collapsed ? "chevron.down" : "chevron.up"}
            size={12}
            tintColor={iconSubtle}
            type="monochrome"
          />
        </>
      ) : null}
    </>
  );

  if (props.collapsible) {
    return (
      <Pressable
        accessibilityLabel={`${props.label}, ${props.modelCount} models`}
        accessibilityRole="button"
        accessibilityState={{ expanded: !props.collapsed }}
        className="mx-4 mt-1 min-h-11 flex-row items-center gap-2 rounded-xl px-1 pt-2 active:opacity-60"
        onPress={props.onToggle}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View accessibilityRole="header" className="mx-4 min-h-9 flex-row items-center gap-2 px-1 pt-1">
      {content}
    </View>
  );
}

/** Compact row that opens a single-choice submenu panel. */
function DisclosureRow(props: {
  readonly label: string;
  readonly value?: string | undefined;
  readonly description?: string | undefined;
  readonly onPress: () => void;
  readonly isLast?: boolean;
}) {
  const iconSubtle = useThemeColor("--color-icon-subtle");
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      className={cn(
        "min-h-[52px] flex-row items-center gap-2 bg-card px-4 py-2 active:bg-subtle-strong",
        !props.isLast && "border-b border-border-subtle",
      )}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-base font-t3-medium text-foreground">{props.label}</Text>
        {props.description ? (
          <Text className="text-xs leading-[17px] text-foreground-muted">{props.description}</Text>
        ) : null}
      </View>
      {props.value ? (
        <Text className="text-base text-foreground-muted" numberOfLines={1}>
          {props.value}
        </Text>
      ) : null}
      <SymbolView name="chevron.right" size={12} tintColor={iconSubtle} type="monochrome" />
    </Pressable>
  );
}

/**
 * A short choice set (reasoning levels, context sizes, service tiers) shown in
 * place: one tap instead of a push, a pick and a way back.
 */
function SegmentedRow(props: {
  readonly label: string;
  readonly choices: ReadonlyArray<ProviderOptionChoice>;
  readonly value: string | undefined;
  readonly description?: string | undefined;
  readonly onSelect: (choiceId: string) => void;
  readonly isLast?: boolean;
}) {
  // Two choices sit beside their label; a wider set needs the full row width.
  const inline = props.choices.length <= 2;
  const segments = (
    <View
      className={cn("flex-row gap-[3px] rounded-[13px] bg-subtle p-[3px]", !inline && "w-full")}
    >
      {props.choices.map((choice) => {
        const selected = choice.id === props.value;
        return (
          <Pressable
            key={choice.id}
            accessibilityLabel={choice.label}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            hitSlop={{ bottom: 8, top: 8 }}
            onPress={() => {
              if (selected) {
                return;
              }
              void hapticSelection();
              props.onSelect(choice.id);
            }}
            className={cn(
              "h-10 items-center justify-center rounded-[10px] active:opacity-60",
              inline ? "min-w-[62px] px-3" : "flex-1",
              selected && "bg-subtle-strong",
            )}
          >
            <Text
              className={cn(
                "text-xs",
                selected ? "font-t3-bold text-foreground" : "text-foreground-muted",
              )}
              numberOfLines={1}
            >
              {segmentChoiceLabel(choice.label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (inline) {
    return (
      <View
        className={cn(
          "min-h-[52px] flex-row items-center gap-3 bg-card px-4 py-2",
          !props.isLast && "border-b border-border-subtle",
        )}
      >
        <Text className="min-w-0 flex-1 text-base font-t3-medium text-foreground">
          {props.label}
        </Text>
        {segments}
      </View>
    );
  }

  return (
    <View
      className={cn("bg-card px-4 pb-4 pt-3", !props.isLast && "border-b border-border-subtle")}
    >
      <Text className="pb-2.5 text-base font-t3-medium text-foreground">{props.label}</Text>
      {segments}
      {props.description ? (
        <Text className="pt-2.5 text-xs leading-[17px] text-foreground-muted">
          {props.description}
        </Text>
      ) : null}
    </View>
  );
}

/** Single option inside a submenu panel. */
function ChoiceRow(props: {
  readonly label: string;
  readonly description?: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly isLast: boolean;
}) {
  const checkmarkColor = useThemeColor("--color-icon");
  return (
    <Pressable
      accessibilityLabel={props.description ? `${props.label}. ${props.description}` : props.label}
      accessibilityRole="radio"
      accessibilityState={{ checked: props.selected }}
      onPress={props.onPress}
      className={cn(
        "min-h-[60px] flex-row items-center gap-3 bg-card px-4 py-3 active:bg-subtle-strong",
        !props.isLast && "border-b border-border-subtle",
      )}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-base font-t3-medium text-foreground">{props.label}</Text>
        {props.description ? (
          <Text className="text-sm leading-5 text-foreground-muted">{props.description}</Text>
        ) : null}
      </View>
      {props.selected ? (
        <SymbolView
          name="checkmark"
          size={16}
          tintColor={checkmarkColor}
          type="monochrome"
          weight="semibold"
        />
      ) : null}
    </Pressable>
  );
}

function SwitchRow(props: {
  readonly label: string;
  readonly description?: string | undefined;
  readonly value: boolean;
  readonly onValueChange: (value: boolean) => void;
  readonly isLast?: boolean;
}) {
  return (
    <View
      className={cn(
        "min-h-[52px] flex-row items-center justify-between gap-3 bg-card px-4 py-1",
        !props.isLast && "border-b border-border-subtle",
      )}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-base font-t3-medium text-foreground">{props.label}</Text>
        {props.description ? (
          <Text className="text-xs leading-[17px] text-foreground-muted">{props.description}</Text>
        ) : null}
      </View>
      <ThemedSwitch
        accessibilityLabel={props.label}
        onValueChange={props.onValueChange}
        value={props.value}
      />
    </View>
  );
}

type ThreadSettingsSubmenuPage =
  | { readonly kind: "descriptor"; readonly id: string }
  | { readonly kind: "runtime" };

type ThreadSettingsSessionProps = {
  readonly providerGroups: ReadonlyArray<ProviderGroup>;
  readonly selectedModel: ModelSelection | null;
  readonly onSelectModel: (option: ModelOption) => void;
  readonly optionDescriptors: ReadonlyArray<ProviderOptionDescriptor>;
  readonly onUpdateOptionSelections: (selections: ReadonlyArray<ProviderOptionSelection>) => void;
  readonly runtimeMode: RuntimeMode;
  readonly onUpdateRuntimeMode: (mode: RuntimeMode) => void;
};

export type ExistingThreadSettingsRouteSession = ThreadSettingsSessionProps & {
  readonly ownerId: string;
};

type ExistingThreadSettingsRouteContextValue = {
  readonly session: ExistingThreadSettingsRouteSession | null;
  readonly present: (session: ExistingThreadSettingsRouteSession) => void;
  readonly clear: (ownerId: string) => void;
};

const ExistingThreadSettingsRouteContext =
  createContext<ExistingThreadSettingsRouteContextValue | null>(null);

/** Bridges the active thread's settings state into the root native sheet route. */
export function ExistingThreadSettingsRouteProvider(props: { readonly children: ReactNode }) {
  const [session, setSession] = useState<ExistingThreadSettingsRouteSession | null>(null);
  const present = useCallback((nextSession: ExistingThreadSettingsRouteSession) => {
    setSession(nextSession);
  }, []);
  const clear = useCallback((ownerId: string) => {
    setSession((current) => (current?.ownerId === ownerId ? null : current));
  }, []);
  const value = useMemo(() => ({ session, present, clear }), [clear, present, session]);

  return (
    <ExistingThreadSettingsRouteContext.Provider value={value}>
      {props.children}
    </ExistingThreadSettingsRouteContext.Provider>
  );
}

export function useExistingThreadSettingsRoutePresentation() {
  const value = use(ExistingThreadSettingsRouteContext);
  if (!value) {
    throw new Error(
      "useExistingThreadSettingsRoutePresentation must be used inside ExistingThreadSettingsRouteProvider.",
    );
  }
  return value;
}

type ThreadSettingsSessionValue = {
  readonly providerGroups: ReadonlyArray<ProviderGroup>;
  readonly runtimeMode: RuntimeMode;
  readonly onUpdateRuntimeMode: (mode: RuntimeMode) => void;
  readonly optionDescriptors: ReadonlyArray<ProviderOptionDescriptor>;
  readonly appliedOption: ModelOption | null;
  readonly selectedModel: ModelSelection | null;
  readonly providerExpansionOverrides: ReadonlySet<string>;
  readonly hasLegacyModels: boolean;
  readonly providerFilter: string | null;
  readonly searchQuery: string;
  readonly showLegacy: boolean;
  readonly applyOptionChange: (id: string, value: string | boolean) => void;
  readonly isApplied: (option: ModelOption) => boolean;
  readonly selectModel: (option: ModelOption) => void;
  readonly setProviderFilter: (providerKey: string | null) => void;
  readonly setSearchQuery: (query: string) => void;
  readonly setShowLegacy: (showLegacy: boolean) => void;
  readonly toggleProvider: (providerKey: string) => void;
};

const ThreadSettingsSessionContext = createContext<ThreadSettingsSessionValue | null>(null);

/** Owns the catalog's browsing state for one picker presentation. */
function ThreadSettingsSessionProvider(
  props: ThreadSettingsSessionProps & { readonly children: ReactNode },
) {
  const [showLegacyToggle, setShowLegacyToggle] = useState(false);
  const [providerFilter, setProviderFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [providerExpansionOverrides, setProviderExpansionOverrides] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const isApplied = useCallback(
    (option: ModelOption) =>
      option.selection.instanceId === props.selectedModel?.instanceId &&
      option.selection.model === props.selectedModel.model,
    [props.selectedModel],
  );

  const appliedOption = useMemo(
    () => props.providerGroups.flatMap((group) => group.models).find(isApplied) ?? null,
    [isApplied, props.providerGroups],
  );

  const hasLegacyModels = useMemo(
    () => props.providerGroups.some((group) => group.models.some((model) => model.isLegacy)),
    [props.providerGroups],
  );

  const applyOptionChange = useCallback(
    (id: string, value: string | boolean) => {
      const next = applyProviderOptionSelection(props.optionDescriptors, { id, value });
      if (!next) {
        return;
      }
      props.onUpdateOptionSelections(next);
    },
    [props.onUpdateOptionSelections, props.optionDescriptors],
  );

  const toggleProvider = useCallback((providerKey: string) => {
    setProviderExpansionOverrides((current) => {
      const next = new Set(current);
      if (!next.delete(providerKey)) {
        next.add(providerKey);
      }
      return next;
    });
  }, []);

  // The model applies on the tap that picked it: the summary screen behind the
  // catalog is what confirms the choice, so there is nothing left to stage.
  const selectModel = useCallback(
    (option: ModelOption) => {
      void hapticSelection();
      props.onSelectModel(option);
    },
    [props.onSelectModel],
  );

  const value = useMemo<ThreadSettingsSessionValue>(
    () => ({
      providerGroups: props.providerGroups,
      runtimeMode: props.runtimeMode,
      onUpdateRuntimeMode: props.onUpdateRuntimeMode,
      optionDescriptors: props.optionDescriptors,
      appliedOption,
      selectedModel: props.selectedModel,
      providerExpansionOverrides,
      hasLegacyModels,
      providerFilter,
      searchQuery,
      showLegacy: showLegacyToggle,
      applyOptionChange,
      isApplied,
      selectModel,
      setProviderFilter,
      setSearchQuery,
      setShowLegacy: setShowLegacyToggle,
      toggleProvider,
    }),
    [
      appliedOption,
      applyOptionChange,
      providerExpansionOverrides,
      hasLegacyModels,
      isApplied,
      props.onUpdateRuntimeMode,
      props.optionDescriptors,
      props.providerGroups,
      props.runtimeMode,
      props.selectedModel,
      providerFilter,
      searchQuery,
      selectModel,
      showLegacyToggle,
      toggleProvider,
    ],
  );

  return (
    <ThreadSettingsSessionContext.Provider value={value}>
      {props.children}
    </ThreadSettingsSessionContext.Provider>
  );
}

function useThreadSettingsSession() {
  const value = use(ThreadSettingsSessionContext);
  if (!value) {
    throw new Error("useThreadSettingsSession must be used inside ThreadSettingsSessionProvider.");
  }
  return value;
}

type ThreadSettingsProviderCatalog = {
  readonly key: string;
  readonly driver: string | undefined;
  readonly label: string;
  readonly collapsible: boolean;
  readonly collapsed: boolean;
  readonly modelCount: number;
  readonly models: ReadonlyArray<ModelOption>;
};

type ThreadSettingsCatalogItem =
  | {
      readonly kind: "provider";
      readonly key: string;
      readonly provider: ThreadSettingsProviderCatalog;
    }
  | {
      readonly kind: "model";
      readonly key: string;
      readonly option: ModelOption;
      readonly isFirst: boolean;
      readonly isLast: boolean;
    }
  | {
      readonly kind: "empty";
      readonly key: "empty";
    };

function ThreadSettingsModelListRow(props: {
  readonly option: ModelOption;
  readonly isFirst: boolean;
  readonly isLast: boolean;
  readonly onSelected: () => void;
}) {
  const session = useThreadSettingsSession();
  const onPress = useCallback(() => {
    session.selectModel(props.option);
    props.onSelected();
  }, [props.onSelected, props.option, session.selectModel]);

  return (
    <ModelRow
      isFirst={props.isFirst}
      isLast={props.isLast}
      onPress={onPress}
      option={props.option}
      selected={session.isApplied(props.option)}
    />
  );
}

function ThreadSettingsProviderListHeader(props: {
  readonly provider: ThreadSettingsProviderCatalog;
}) {
  const session = useThreadSettingsSession();
  const onToggle = useCallback(
    () => session.toggleProvider(props.provider.key),
    [props.provider.key, session.toggleProvider],
  );

  return (
    <ProviderHeader
      collapsible={props.provider.collapsible}
      collapsed={props.provider.collapsed}
      driver={props.provider.driver}
      label={props.provider.label}
      modelCount={props.provider.modelCount}
      onToggle={onToggle}
    />
  );
}

function useThreadSettingsCatalogItems(
  session: ThreadSettingsSessionValue,
): ReadonlyArray<ThreadSettingsCatalogItem> {
  return useMemo(
    () =>
      session.providerGroups.flatMap((group) => {
        if (session.providerFilter !== null && group.providerKey !== session.providerFilter) {
          return [];
        }
        const driver = group.models[0]?.providerDriver;
        const catalogModels = session.showLegacy
          ? group.models
          : group.models.filter((model) => !model.isLegacy || session.isApplied(model));
        const visibleModels = catalogModels.filter((model) =>
          modelMatchesCatalogQuery({
            model,
            providerLabel: group.providerLabel,
            query: session.searchQuery,
          }),
        );
        if (visibleModels.length === 0) {
          return [];
        }
        const isPrimary = driver !== undefined && PRIMARY_PROVIDER_DRIVERS.has(driver);
        const containsAppliedSelection = group.models.some(session.isApplied);
        const isNarrowed = session.providerFilter !== null || session.searchQuery.trim().length > 0;
        const collapsible = !isNarrowed;
        const collapsed = providerSectionIsCollapsed({
          defaultExpanded: isPrimary || containsAppliedSelection,
          hasExpansionOverride: session.providerExpansionOverrides.has(group.providerKey),
          isNarrowed,
        });
        const provider: ThreadSettingsProviderCatalog = {
          key: group.providerKey,
          driver,
          label: group.providerLabel,
          collapsible,
          collapsed,
          modelCount: visibleModels.length,
          models: collapsed ? [] : visibleModels,
        };
        return [
          {
            kind: "provider" as const,
            key: `provider:${group.providerKey}`,
            provider,
          },
          ...provider.models.map((option, index) => ({
            kind: "model" as const,
            key: `model:${option.key}`,
            option,
            isFirst: index === 0,
            isLast: index === provider.models.length - 1,
          })),
        ];
      }),
    [
      session.isApplied,
      session.providerExpansionOverrides,
      session.providerFilter,
      session.providerGroups,
      session.searchQuery,
      session.showLegacy,
    ],
  );
}

/** Horizontal provider filter, in place of a filter buried in a header menu. */
function ProviderFilterChips() {
  const session = useThreadSettingsSession();
  if (session.providerGroups.length < 2) {
    return null;
  }

  const chips = [
    { key: null, label: "All", count: undefined as number | undefined },
    ...session.providerGroups.map((group) => ({
      key: group.providerKey,
      label: group.providerLabel,
      count: group.models.length,
    })),
  ];

  return (
    <ScrollView
      className="grow-0"
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
      horizontal
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
    >
      {chips.map((chip) => {
        const active = session.providerFilter === chip.key;
        return (
          <Pressable
            key={chip.key ?? "all"}
            accessibilityLabel={chip.label}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => session.setProviderFilter(chip.key)}
            className={cn(
              "h-9 flex-row items-center gap-1.5 rounded-full px-3.5 active:opacity-60",
              active ? "bg-subtle-strong" : "bg-subtle",
            )}
          >
            <Text
              className={cn(
                "text-xs",
                active ? "font-t3-bold text-foreground" : "text-foreground-secondary",
              )}
            >
              {chip.label}
            </Text>
            {chip.count !== undefined ? (
              <Text className="text-2xs text-foreground-tertiary">{chip.count}</Text>
            ) : null}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** The thread's model, its options and its permissions on one screen. */
function ThreadSettingsSummaryContent(props: {
  readonly onOpenCatalog: () => void;
  readonly onOpenSubmenu: (submenu: ThreadSettingsSubmenuPage) => void;
}) {
  const insets = useSafeAreaInsets();
  const session = useThreadSettingsSession();
  const iconSubtle = useThemeColor("--color-icon-subtle");
  const runtimeChoice = RUNTIME_MODE_CHOICES.find((choice) => choice.mode === session.runtimeMode);
  const modelLabel =
    session.appliedOption?.label ?? session.selectedModel?.model ?? "Choose a model";

  return (
    <ScrollView
      className="flex-1 bg-sheet"
      contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 4 }}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <SectionLabel title="Model" />
      <Animated.View
        className="mx-4 overflow-hidden rounded-[20px] bg-card"
        layout={THREAD_SETTINGS_OPTIONS_LAYOUT_TRANSITION}
      >
        <Pressable
          accessibilityLabel={`Model, ${modelLabel}`}
          accessibilityRole="button"
          onPress={props.onOpenCatalog}
          className={cn(
            "min-h-[64px] flex-row items-center gap-3 px-4 py-2 active:bg-subtle-strong",
            session.optionDescriptors.length > 0 && "border-b border-border-subtle",
          )}
        >
          <ProviderIcon provider={session.appliedOption?.providerDriver} size={22} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-base font-t3-medium text-foreground" numberOfLines={1}>
              {modelLabel}
            </Text>
            {session.appliedOption ? (
              <Text className="text-xs text-foreground-muted" numberOfLines={1}>
                {session.appliedOption.providerLabel}
              </Text>
            ) : null}
          </View>
          <Text className="text-sm text-foreground-muted">Change</Text>
          <SymbolView name="chevron.right" size={12} tintColor={iconSubtle} type="monochrome" />
        </Pressable>

        {session.optionDescriptors.map((descriptor, index) => {
          const isLast = index === session.optionDescriptors.length - 1;
          if (descriptor.type === "boolean") {
            return (
              <Animated.View key={descriptor.id} layout={THREAD_SETTINGS_OPTIONS_LAYOUT_TRANSITION}>
                <SwitchRow
                  description={descriptor.description}
                  isLast={isLast}
                  label={descriptor.label}
                  onValueChange={(value) => session.applyOptionChange(descriptor.id, value)}
                  value={descriptor.currentValue ?? false}
                />
              </Animated.View>
            );
          }

          const choices = selectableChoices(descriptor);
          const rawValue = getProviderOptionCurrentValue(descriptor);
          const currentValue = typeof rawValue === "string" ? rawValue : undefined;
          return (
            <Animated.View key={descriptor.id} layout={THREAD_SETTINGS_OPTIONS_LAYOUT_TRANSITION}>
              {canRenderChoiceSegments(choices) ? (
                <SegmentedRow
                  choices={choices}
                  description={choiceDescription(descriptor, currentValue)}
                  isLast={isLast}
                  label={descriptor.label}
                  onSelect={(choiceId) => session.applyOptionChange(descriptor.id, choiceId)}
                  value={currentValue}
                />
              ) : (
                <DisclosureRow
                  isLast={isLast}
                  label={descriptor.label}
                  onPress={() => props.onOpenSubmenu({ kind: "descriptor", id: descriptor.id })}
                  value={getProviderOptionCurrentLabel(descriptor)}
                />
              )}
            </Animated.View>
          );
        })}
      </Animated.View>

      <SectionLabel className="pt-7" title="Permissions" />
      <View className="mx-4 overflow-hidden rounded-[20px] bg-card">
        <DisclosureRow
          description={runtimeChoice?.description}
          isLast
          label={runtimeChoice?.label ?? "Runtime"}
          onPress={() => props.onOpenSubmenu({ kind: "runtime" })}
        />
      </View>

      <Text className="px-5 pt-3 text-2xs leading-4 text-foreground-tertiary">
        Applies to this thread. Changes take effect on your next message.
      </Text>
    </ScrollView>
  );
}

/** One native scroll owner for the model catalog. */
function ThreadSettingsCatalogContent(props: { readonly onSelected: () => void }) {
  const insets = useSafeAreaInsets();
  const session = useThreadSettingsSession();
  const catalogItems = useThreadSettingsCatalogItems(session);
  const [animationsReady, setAnimationsReady] = useState(false);
  const nativeHeaderHeight = use(HeaderHeightContext) ?? 0;
  const hasActiveCatalogFilter =
    session.providerFilter !== null || session.searchQuery.trim().length > 0;
  const usesTransparentNativeHeader = Platform.OS === "ios" && NATIVE_LIQUID_GLASS_SUPPORTED;
  const bottomToolbarInset =
    Platform.OS === "ios" && NATIVE_MAIL_SEARCH_TOOLBAR_SUPPORTED
      ? NATIVE_MAIL_SEARCH_TOOLBAR_CONTENT_INSET
      : 0;
  const listItems = useMemo<ReadonlyArray<ThreadSettingsCatalogItem>>(
    () =>
      catalogItems.length === 0 && hasActiveCatalogFilter
        ? [{ kind: "empty", key: "empty" }]
        : catalogItems,
    [catalogItems, hasActiveCatalogFilter],
  );
  const renderCatalogItem = useCallback(
    (itemProps: LegendListRenderItemProps<ThreadSettingsCatalogItem>) => {
      const item = itemProps.item;
      let content: ReactNode;

      if (item.kind === "provider") {
        content = <ThreadSettingsProviderListHeader provider={item.provider} />;
      } else if (item.kind === "model") {
        content = (
          <ThreadSettingsModelListRow
            isFirst={item.isFirst}
            isLast={item.isLast}
            onSelected={props.onSelected}
            option={item.option}
          />
        );
      } else {
        content = (
          <View className="items-center px-8 py-14">
            <Text className="text-center text-sm text-foreground-muted">No matching models</Text>
          </View>
        );
      }

      return (
        <Animated.View
          key={item.key}
          entering={animationsReady ? THREAD_SETTINGS_CATALOG_ENTER_TRANSITION : undefined}
          exiting={animationsReady ? THREAD_SETTINGS_CATALOG_EXIT_TRANSITION : undefined}
        >
          {content}
        </Animated.View>
      );
    },
    [animationsReady, props.onSelected],
  );

  return (
    <AnimatedLegendList
      automaticallyAdjustsScrollIndicatorInsets
      className="flex-1 bg-sheet"
      contentContainerStyle={{ paddingTop: 4 }}
      contentInsetAdjustmentBehavior={usesTransparentNativeHeader ? "never" : "automatic"}
      data={listItems}
      estimatedItemSize={56}
      extraData={animationsReady}
      getItemType={(item) => item.kind}
      itemLayoutAnimation={THREAD_SETTINGS_CATALOG_LAYOUT_TRANSITION}
      keyExtractor={(item) => item.key}
      keyboardDismissMode="on-drag"
      keyboardShouldPersistTaps="handled"
      maintainVisibleContentPosition={THREAD_SETTINGS_MAINTAIN_VISIBLE_CONTENT_POSITION}
      ListHeaderComponent={
        <>
          {usesTransparentNativeHeader ? <View style={{ height: nativeHeaderHeight }} /> : null}
          {Platform.OS === "android" ? (
            <View className="px-4 pb-2 pt-3">
              <TextInput
                accessibilityLabel="Find a model"
                autoCapitalize="none"
                autoCorrect={false}
                className="h-11 rounded-xl bg-card px-4 text-base text-foreground"
                onChangeText={session.setSearchQuery}
                placeholder="Find a model"
                placeholderTextColorClassName="accent-placeholder"
                value={session.searchQuery}
              />
            </View>
          ) : null}
          <View className="pb-1 pt-1">
            <ProviderFilterChips />
          </View>
        </>
      }
      ListFooterComponent={
        <View style={{ paddingBottom: insets.bottom + bottomToolbarInset + 12 }}>
          {session.hasLegacyModels ? (
            <>
              <SectionLabel className="pt-6" title="Catalog" />
              <View className="mx-4 overflow-hidden rounded-[20px] bg-card">
                <SwitchRow
                  description="Older models, hidden by default."
                  isLast
                  label="Legacy models"
                  onValueChange={session.setShowLegacy}
                  value={session.showLegacy}
                />
              </View>
            </>
          ) : null}
        </View>
      }
      recycleItems
      onLoad={() => setAnimationsReady(true)}
      renderItem={renderCatalogItem}
      showsVerticalScrollIndicator={false}
    />
  );
}

/** Compact choice page pushed by the picker navigator. */
function ThreadSettingsChoiceContent(props: {
  readonly submenu: ThreadSettingsSubmenuPage;
  readonly onSelected: () => void;
}) {
  const insets = useSafeAreaInsets();
  const session = useThreadSettingsSession();
  const descriptorId = props.submenu.kind === "descriptor" ? props.submenu.id : null;

  const activeDescriptor =
    descriptorId !== null
      ? session.optionDescriptors.find(
          (descriptor) => descriptor.type === "select" && descriptor.id === descriptorId,
        )
      : undefined;

  const submenuContent =
    props.submenu.kind === "runtime"
      ? {
          rows: RUNTIME_MODE_CHOICES.map((choice) => ({
            id: choice.mode,
            label: choice.label,
            description: choice.description,
            selected: choice.mode === session.runtimeMode,
            onPress: () => {
              void hapticSelection();
              session.onUpdateRuntimeMode(choice.mode);
              props.onSelected();
            },
          })),
        }
      : activeDescriptor?.type === "select"
        ? {
            rows: selectableChoices(activeDescriptor).map((choice) => ({
              id: choice.id,
              label: choice.label,
              description: choice.description,
              selected: choice.id === getProviderOptionCurrentValue(activeDescriptor),
              onPress: () => {
                void hapticSelection();
                session.applyOptionChange(activeDescriptor.id, choice.id);
                props.onSelected();
              },
            })),
          }
        : null;

  if (!submenuContent) {
    return <View className="flex-1 bg-sheet" />;
  }

  return (
    <ScrollView
      className="flex-1 bg-sheet"
      contentContainerStyle={{
        paddingBottom: insets.bottom + 12,
        paddingHorizontal: 16,
        paddingTop: 16,
      }}
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
    >
      <View className="overflow-hidden rounded-[20px] bg-card">
        {submenuContent.rows.map((row, index) => (
          <ChoiceRow
            key={row.id}
            description={row.description}
            isLast={index === submenuContent.rows.length - 1}
            label={row.label}
            selected={row.selected}
            onPress={row.onPress}
          />
        ))}
      </View>
    </ScrollView>
  );
}

type ThreadSettingsPickerStackParams = {
  ThreadSettingsSummary: undefined;
  ThreadSettingsModels: undefined;
  ThreadSettingsChoice: ThreadSettingsSubmenuPage & { readonly title: string };
};

type ThreadSettingsPickerPresentation = {
  readonly onClose: () => void;
};

const ThreadSettingsPickerStack = createNativeStackNavigator<ThreadSettingsPickerStackParams>();
const ThreadSettingsPickerPresentationContext =
  createContext<ThreadSettingsPickerPresentation | null>(null);

function useThreadSettingsPickerPresentation() {
  const value = use(ThreadSettingsPickerPresentationContext);
  if (!value) {
    throw new Error(
      "useThreadSettingsPickerPresentation must be used inside ThreadSettingsPickerNavigator.",
    );
  }
  return value;
}

function ThreadSettingsSummaryScreen() {
  const session = useThreadSettingsSession();
  const presentation = useThreadSettingsPickerPresentation();
  const navigation = useNavigation<NativeStackNavigationProp<ThreadSettingsPickerStackParams>>();

  const openSubmenu = useCallback(
    (submenu: ThreadSettingsSubmenuPage) => {
      const title =
        submenu.kind === "runtime"
          ? "Permissions"
          : (session.optionDescriptors.find(
              (descriptor) => descriptor.type === "select" && descriptor.id === submenu.id,
            )?.label ?? "Option");
      navigation.navigate("ThreadSettingsChoice", { ...submenu, title });
    },
    [navigation, session.optionDescriptors],
  );

  return (
    <>
      {Platform.OS === "android" ? (
        <AndroidScreenHeader
          actions={[
            {
              accessibilityLabel: "Done",
              icon: "checkmark",
              onPress: presentation.onClose,
            },
          ]}
          onBack={presentation.onClose}
          title="Thread settings"
        />
      ) : null}
      <NativeStackScreenOptions options={{ headerShown: Platform.OS !== "android" }} />
      <ThreadSettingsSummaryContent
        onOpenCatalog={() => navigation.navigate("ThreadSettingsModels")}
        onOpenSubmenu={openSubmenu}
      />
      <NativeHeaderToolbar placement="right">
        <NativeHeaderToolbar.Button
          accessibilityLabel="Done"
          label="Done"
          onPress={presentation.onClose}
        />
      </NativeHeaderToolbar>
    </>
  );
}

function ThreadSettingsModelsScreen() {
  const session = useThreadSettingsSession();
  const navigation = useNavigation<NativeStackNavigationProp<ThreadSettingsPickerStackParams>>();
  const usesNativeMailSearchToolbar = Platform.OS === "ios" && NATIVE_MAIL_SEARCH_TOOLBAR_SUPPORTED;
  const closeCatalog = useCallback(() => navigation.goBack(), [navigation]);

  return (
    <>
      {Platform.OS === "android" ? (
        <AndroidScreenHeader onBack={closeCatalog} title="Change model" />
      ) : null}
      <NativeStackScreenOptions
        optionsVersion={[session.providerGroups.map((group) => group.providerKey)]}
        options={{
          unstable_headerToolbarItems: usesNativeMailSearchToolbar
            ? () => [
                createNativeMailSearchToolbarItem({
                  onSearchTextChange: session.setSearchQuery,
                  placeholder: "Find a model",
                  searchTextChangeId: "thread-settings-model-search-text",
                  showsSearchDismissButton: true,
                }),
              ]
            : undefined,
          headerShown: Platform.OS !== "android",
          headerSearchBarOptions:
            Platform.OS === "ios" && !usesNativeMailSearchToolbar
              ? {
                  autoCapitalize: "none",
                  hideNavigationBar: false,
                  obscureBackground: false,
                  onCancelButtonPress: () => session.setSearchQuery(""),
                  onChangeText: (event) => session.setSearchQuery(event.nativeEvent.text),
                  placeholder: "Find a model",
                }
              : undefined,
        }}
      />
      <ThreadSettingsCatalogContent onSelected={closeCatalog} />
    </>
  );
}

function ThreadSettingsChoiceScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ThreadSettingsPickerStackParams>>();
  const route = useRoute<RouteProp<ThreadSettingsPickerStackParams, "ThreadSettingsChoice">>();

  return (
    <>
      <NativeStackScreenOptions options={{ headerShown: Platform.OS !== "android" }} />
      {Platform.OS === "android" ? (
        <AndroidScreenHeader title={route.params.title} onBack={() => navigation.goBack()} />
      ) : null}
      <ThreadSettingsChoiceContent submenu={route.params} onSelected={() => navigation.goBack()} />
    </>
  );
}

function ThreadSettingsPickerNavigator(props: ThreadSettingsPickerPresentation) {
  const solidSheetBackground = String(useThemeColor("--color-sheet-solid"));
  const foreground = String(useThemeColor("--color-foreground"));
  const presentation = useMemo(
    () => ({
      onClose: props.onClose,
    }),
    [props.onClose],
  );

  return (
    <ThreadSettingsPickerPresentationContext.Provider value={presentation}>
      <ThreadSettingsPickerStack.Navigator
        initialRouteName="ThreadSettingsSummary"
        screenOptions={{
          animation: "slide_from_right",
          contentStyle: { backgroundColor: solidSheetBackground },
          gestureEnabled: true,
          headerBackButtonDisplayMode: "minimal",
          headerBackTitle: "",
          headerShadowVisible: false,
          headerStyle: {
            backgroundColor: NATIVE_LIQUID_GLASS_SUPPORTED ? "transparent" : solidSheetBackground,
          },
          headerTransparent: NATIVE_LIQUID_GLASS_SUPPORTED,
          headerTintColor: foreground,
          headerTitleStyle: { fontSize: 17, fontWeight: "700" },
          scrollEdgeEffects: NATIVE_LIQUID_GLASS_SUPPORTED
            ? THREAD_SETTINGS_HEADER_SCROLL_EDGE_EFFECTS
            : undefined,
        }}
      >
        <ThreadSettingsPickerStack.Screen
          name="ThreadSettingsSummary"
          component={ThreadSettingsSummaryScreen}
          options={{ headerBackVisible: false, title: "Thread settings" }}
        />
        <ThreadSettingsPickerStack.Screen
          name="ThreadSettingsModels"
          component={ThreadSettingsModelsScreen}
          options={{ title: "Change model" }}
        />
        <ThreadSettingsPickerStack.Screen
          name="ThreadSettingsChoice"
          component={ThreadSettingsChoiceScreen}
          options={({ route }) => ({ title: route.params.title })}
        />
      </ThreadSettingsPickerStack.Navigator>
    </ThreadSettingsPickerPresentationContext.Provider>
  );
}

/** Existing-thread model picker hosted by the root RNS form-sheet route. */
export function ExistingThreadSettingsRouteScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  const presentation = useExistingThreadSettingsRoutePresentation();
  const session = presentation.session;

  useEffect(() => {
    if (session) {
      return;
    }

    navigation.goBack();
  }, [navigation, session]);

  if (!session) {
    return <View className="flex-1 bg-sheet" />;
  }

  const { ownerId: _ownerId, ...settings } = session;

  return (
    <ThreadSettingsSessionProvider {...settings}>
      <ThreadSettingsPickerNavigator onClose={() => navigation.goBack()} />
    </ThreadSettingsSessionProvider>
  );
}

/**
 * Native stack hosted by the New Task navigator's form-sheet route. Keeping
 * the sheet presentation in RNS gives UIKit ownership of nested dismissal,
 * while the catalog and the choice pages remain regular pushes inside this
 * navigator.
 */
export function NewTaskThreadSettingsRouteScreen() {
  const flow = useNewTaskFlow();
  const navigation = useNavigation<NativeStackNavigationProp<Record<string, object | undefined>>>();
  const optionDescriptors = useMemo(
    () =>
      resolveProviderOptionDescriptors({
        capabilities: flow.selectedModelOption?.capabilities,
        selections: flow.selectedModel?.options,
      }),
    [flow.selectedModel?.options, flow.selectedModelOption?.capabilities],
  );

  return (
    <ThreadSettingsSessionProvider
      providerGroups={flow.providerGroups}
      selectedModel={flow.selectedModel}
      onSelectModel={(option) => flow.setSelectedModelKey(option.key, option.selection.options)}
      optionDescriptors={optionDescriptors}
      onUpdateOptionSelections={flow.setSelectedModelOptions}
      runtimeMode={flow.runtimeMode}
      onUpdateRuntimeMode={flow.setRuntimeMode}
    >
      <ThreadSettingsPickerNavigator onClose={() => navigation.goBack()} />
    </ThreadSettingsSessionProvider>
  );
}
