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
      "PUBLISHING",
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
      "PUBLISHING",
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

  describe("PUBLISHING", () => {
    it("is reachable only from READY_FOR_REVIEW", () => {
      expect(ProjectStateMachine.canTransition("READY_FOR_REVIEW", "PUBLISHING")).toBe(true);
      expect(ProjectStateMachine.canTransition("QUALITY_CHECK", "PUBLISHING")).toBe(false);
      expect(ProjectStateMachine.canTransition("RENDERING", "PUBLISHING")).toBe(false);
    });

    it("can revert to READY_FOR_REVIEW when a publish attempt fails", () => {
      expect(() => ProjectStateMachine.assertTransition("PUBLISHING", "READY_FOR_REVIEW")).not.toThrow();
    });

    it("deliberately cannot be cancelled mid-upload", () => {
      // A CANCELLED project is terminal, but PUBLISHING has already
      // committed to an external, non-retractable side effect (a
      // YouTube upload in flight) -- allowing a cancel here would let
      // the project end up CANCELLED while the upload still completes
      // in the background with nowhere valid to report success to.
      expect(ProjectStateMachine.canTransition("PUBLISHING", "CANCELLED")).toBe(false);
    });
  });
});
