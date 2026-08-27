import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

/**
 * Semantic haptics for the whole app. Call these instead of `expo-haptics`
 * directly: iOS gets the Taptic Engine generators, Android gets
 * `View.performHapticFeedback` constants, which the system tunes (and the user
 * can mute) rather than the buzzy raw `Vibrator` waveforms `impactAsync` and
 * friends fall back to there.
 *
 * `androidFallback` covers the constants that only exist from API 30/34 up;
 * the fallbacks are available on every level we ship to.
 */
function feedback(
  ios: () => Promise<void>,
  android: Haptics.AndroidHaptics,
  androidFallback?: Haptics.AndroidHaptics,
) {
  return (): Promise<void> => {
    if (Platform.OS !== "android") {
      return ios();
    }
    const performed = Haptics.performAndroidHapticsAsync(android);
    return androidFallback
      ? performed.catch(() => Haptics.performAndroidHapticsAsync(androidFallback))
      : performed;
  };
}

/** The softest tick, safe to repeat: list picks, slider steps, disclosure toggles.
 * `Clock_Tick` is the picker-scrub tick, so it stays gentle when repeated but is
 * still felt on a single pick (unlike `Segment_Frequent_Tick`, which is allowed
 * to do nothing at all on weaker motors). */
export const hapticSelection = feedback(
  () => Haptics.selectionAsync(),
  Haptics.AndroidHaptics.Clock_Tick,
);

/** One deliberate tap landed: copy, navigate, fire an action. */
export const hapticTap = feedback(
  () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  Haptics.AndroidHaptics.Context_Click,
);

/** A gesture crossed its threshold: long press, swipe action armed. */
export const hapticLongPress = feedback(
  () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft),
  Haptics.AndroidHaptics.Long_Press,
);

/** A long-running action settled. */
export const hapticSuccess = feedback(
  () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
  Haptics.AndroidHaptics.Confirm,
  Haptics.AndroidHaptics.Virtual_Key,
);

export const hapticError = feedback(
  () => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error),
  Haptics.AndroidHaptics.Reject,
  Haptics.AndroidHaptics.Long_Press,
);
