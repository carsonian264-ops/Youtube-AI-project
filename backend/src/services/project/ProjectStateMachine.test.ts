import { ProjectStateMachine } from "./ProjectStateMachine";

describe("ProjectStateMachine", () => {
  it("allows the full happy-path pipeline in sequence", () => {
    const sequence: Parameters<typeof ProjectStateMachine.assertTransition>[1][] = [
      "PLANNING",
      "SCRIPT_GENERATING",
      "SCRIPT_READY",
      "SCENES_READY",
      "ASSETS_GENERATING",
      "AUDIO_GENERATING",
      "RENDERING",
      "QUALITY_CHECK",
      "READY_FOR_REVIEW",
      "PUBLISHED",
    ];
    let current: Parameters<typeof ProjectStateMachine.assertTransition>[0] = "DRAFT";
    for (const next of sequence) {
      expect(() => ProjectStateMachine.assertTransition(current, next)).not.toThrow();
      current = next;
    }
  });

  it("rejects skipping straight from DRAFT to PUBLISHED", () => {
    expect(() => ProjectStateMachine.assertTransition("DRAFT", "PUBLISHED")).toThrow();
  });

  it("rejects transitioning out of a terminal state", () => {
    expect(() => ProjectStateMachine.assertTransition("PUBLISHED", "DRAFT")).toThrow();
    expect(ProjectStateMachine.isTerminal("PUBLISHED")).toBe(true);
    expect(ProjectStateMachine.isTerminal("CANCELLED")).toBe(true);
  });

  it("allows every non-terminal state to fail", () => {
    const nonTerminal: Parameters<typeof ProjectStateMachine.assertTransition>[0][] = [
      "DRAFT",
      "PLANNING",
      "SCRIPT_GENERATING",
      "SCRIPT_READY",
      "SCENES_GENERATING",
      "SCENES_READY",
      "ASSETS_GENERATING",
      "AUDIO_GENERATING",
      "RENDERING",
      "QUALITY_CHECK",
      "READY_FOR_REVIEW",
    ];
    for (const state of nonTerminal) {
      expect(ProjectStateMachine.canTransition(state, "FAILED")).toBe(true);
    }
  });

  it("allows retrying from FAILED back to PLANNING", () => {
    expect(() => ProjectStateMachine.assertTransition("FAILED", "PLANNING")).not.toThrow();
  });

  it("treats a same-state transition as a no-op success", () => {
    expect(ProjectStateMachine.canTransition("RENDERING", "RENDERING")).toBe(true);
  });
});
