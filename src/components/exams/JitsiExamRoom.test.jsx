import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import JitsiExamRoom from "./JitsiExamRoom";


describe("JitsiExamRoom", () => {
  let handlers;
  let api;
  let constructor;

  beforeEach(() => {
    handlers = {};
    api = {
      addEventListener: vi.fn((name, callback) => {
        handlers[name] = callback;
      }),
      executeCommand: vi.fn(),
      dispose: vi.fn(),
    };
    constructor = vi.fn(function MockJitsiExternalApi() {
      return api;
    });
    window.JitsiMeetExternalAPI = constructor;
  });

  afterEach(() => {
    cleanup();
    delete window.JitsiMeetExternalAPI;
  });

  it("joins the server-assigned room, applies its password, and emits audit telemetry", async () => {
    const onEvent = vi.fn();
    const session = {
      enabled: true,
      domain: "meet.jit.si",
      room_code: "B",
      room_name: "sureproed-server-assigned-room",
      room_password: "server-secret",
      display_name: "Candidate One",
    };

    const { unmount } = render(<JitsiExamRoom session={session} onEvent={onEvent} />);

    await waitFor(() => expect(constructor).toHaveBeenCalledTimes(1));
    expect(constructor).toHaveBeenCalledWith(
      "meet.jit.si",
      expect.objectContaining({
        roomName: "sureproed-server-assigned-room",
        userInfo: { displayName: "Candidate One" },
        configOverwrite: expect.objectContaining({
          prejoinConfig: { enabled: false },
          toolbarButtons: expect.arrayContaining(["microphone", "camera", "hangup"]),
        }),
      })
    );

    act(() => handlers.participantRoleChanged({ role: "moderator" }));
    expect(api.executeCommand).toHaveBeenCalledWith("password", "server-secret");

    act(() => handlers.videoConferenceJoined());
    expect(screen.getByText("CONNECTED")).toBeInTheDocument();
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "JITSI_JOINED" })
    );

    unmount();
    expect(api.dispose).toHaveBeenCalledTimes(1);
  });

  it("does not recreate the iframe when parent callbacks and session objects refresh", async () => {
    const session = {
      enabled: true,
      domain: "meet.jit.si",
      room_code: "A",
      room_name: "stable-room",
      room_password: "stable-secret",
      display_name: "Candidate One",
    };
    const { rerender } = render(<JitsiExamRoom session={session} onEvent={vi.fn()} />);
    await waitFor(() => expect(constructor).toHaveBeenCalledTimes(1));

    rerender(<JitsiExamRoom session={{ ...session }} onEvent={vi.fn()} />);

    expect(constructor).toHaveBeenCalledTimes(1);
    expect(api.dispose).not.toHaveBeenCalled();
  });
});
