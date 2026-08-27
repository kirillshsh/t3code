import type { RemoteClientConnectionState } from "../../lib/connection";

/**
 * Connection status, tiered by how much of the user's attention the state
 * deserves. "retrying" is a state the client resolves on its own, so it gets a
 * bare line with no surface of its own; "blocked" means messages will not send
 * until someone acts, so it gets a card carrying that action. A connected
 * environment reports nothing here at all — thread sync is a hairline at the
 * top of the feed, not chrome over the composer.
 */
export type ComposerConnectionStatus =
  | { readonly kind: "retrying"; readonly label: string }
  | { readonly kind: "blocked"; readonly title: string; readonly detail: string };

export function composerConnectionStatus(input: {
  readonly connectionError: string | null;
  readonly connectionState: RemoteClientConnectionState;
  readonly environmentLabel: string | null;
}): ComposerConnectionStatus | null {
  const environmentLabel = input.environmentLabel ?? "Environment";

  switch (input.connectionState) {
    case "connecting":
    case "reconnecting":
      return { kind: "retrying", label: `Reconnecting to ${environmentLabel}` };
    case "offline":
      return {
        kind: "blocked",
        title: "You are offline",
        detail: "Messages queue up and send when your connection returns.",
      };
    case "error":
      return {
        kind: "blocked",
        title: `${environmentLabel} is unavailable`,
        detail: input.connectionError ?? "The app will keep retrying automatically.",
      };
    case "available":
      return {
        kind: "blocked",
        title: `${environmentLabel} is not connected`,
        detail: "Reconnect the environment to send messages.",
      };
    case "connected":
      return null;
  }
}
