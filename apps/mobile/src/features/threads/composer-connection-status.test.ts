import { describe, expect, it } from "vite-plus/test";

import { composerConnectionStatus } from "./composer-connection-status";

describe("composerConnectionStatus", () => {
  it("reports nothing while connected — thread sync is the feed's hairline", () => {
    expect(
      composerConnectionStatus({
        connectionError: null,
        connectionState: "connected",
        environmentLabel: "Julius’s Mac mini",
      }),
    ).toBeNull();
  });

  it("keeps a self-healing reconnect in the quiet tier", () => {
    for (const connectionState of ["connecting", "reconnecting"] as const) {
      expect(
        composerConnectionStatus({
          connectionError: "socket hang up",
          connectionState,
          environmentLabel: "Julius’s Mac mini",
        }),
      ).toEqual({ kind: "retrying", label: "Reconnecting to Julius’s Mac mini" });
    }
  });

  it("escalates the states that stop messages from sending", () => {
    for (const connectionState of ["offline", "error", "available"] as const) {
      expect(
        composerConnectionStatus({
          connectionError: null,
          connectionState,
          environmentLabel: "Julius’s Mac mini",
        }),
      ).toMatchObject({ kind: "blocked" });
    }
  });

  it("carries the connection error as the failure detail", () => {
    expect(
      composerConnectionStatus({
        connectionError: "ECONNREFUSED",
        connectionState: "error",
        environmentLabel: "Julius’s Mac mini",
      }),
    ).toEqual({
      kind: "blocked",
      title: "Julius’s Mac mini is unavailable",
      detail: "ECONNREFUSED",
    });
  });

  it("falls back to a generic environment name", () => {
    expect(
      composerConnectionStatus({
        connectionError: null,
        connectionState: "available",
        environmentLabel: null,
      }),
    ).toMatchObject({ title: "Environment is not connected" });
  });
});
