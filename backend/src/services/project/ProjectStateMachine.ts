import type { ProjectStatus } from "@/generated/prisma";
import { InvalidStateTransitionError } from "@/utils/errors";

/**
 * The only place in the application that knows which ProjectStatus
 * transitions are legal. Every status write on a Project should go
 * through ProjectStateMachine.assertTransition() first -- this is what
 * "do not allow impossible state transitions" (spec section 11) means in
 * practice.
 */
// Every non-terminal state can transition to FAILED: a job can throw
// while a project is sitting in a "just finished this stage" checkpoint
// state just as easily as while it's actively generating (e.g. the
// content-generation job's character-bible step runs *after* the project
// has already moved to SCRIPT_READY). Without this, an error thrown from
// a checkpoint state raises InvalidStateTransitionError from inside the
// worker's own failure handler, which gets swallowed and leaves the
// project stuck forever instead of visibly FAILED -- this was caught by
// an end-to-end smoke test, not by inspection, and is exactly the kind
// of impossible-transition bug section 11 asks this module to prevent.
const NON_TERMINAL_STATES: ProjectStatus[] = [
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
  "FAILED",
];

const BASE_TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = {
  DRAFT: ["PLANNING", "CANCELLED"],
  PLANNING: ["SCRIPT_GENERATING", "CANCELLED"],
  SCRIPT_GENERATING: ["SCRIPT_READY", "CANCELLED"],
  // Script generation and scene breakdown happen inside the same
  // content-generation job (see contentGeneration.worker.ts), so
  // SCRIPT_READY -> SCENES_READY is a direct, expected transition, not
  // just SCRIPT_READY -> SCENES_GENERATING. SCENES_GENERATING is still a
  // reachable state for standalone scene-breakdown regeneration.
  SCRIPT_READY: ["SCENES_GENERATING", "SCENES_READY", "SCRIPT_GENERATING", "CANCELLED"],
  SCENES_GENERATING: ["SCENES_READY", "CANCELLED"],
  SCENES_READY: ["ASSETS_GENERATING", "SCENES_GENERATING", "CANCELLED"],
  ASSETS_GENERATING: ["AUDIO_GENERATING", "ASSETS_GENERATING", "CANCELLED"],
  AUDIO_GENERATING: ["RENDERING", "AUDIO_GENERATING", "CANCELLED"],
  RENDERING: ["QUALITY_CHECK", "CANCELLED"],
  QUALITY_CHECK: ["READY_FOR_REVIEW", "RENDERING", "CANCELLED"],
  READY_FOR_REVIEW: ["PUBLISHED", "ASSETS_GENERATING", "RENDERING", "CANCELLED"],
  PUBLISHED: [],
  FAILED: ["PLANNING", "CANCELLED"],
  CANCELLED: [],
};

const TRANSITIONS: Record<ProjectStatus, ProjectStatus[]> = Object.fromEntries(
  (Object.entries(BASE_TRANSITIONS) as [ProjectStatus, ProjectStatus[]][]).map(([from, to]) => [
    from,
    NON_TERMINAL_STATES.includes(from) && from !== "FAILED" ? [...to, "FAILED"] : to,
  ]),
) as Record<ProjectStatus, ProjectStatus[]>;

export class ProjectStateMachine {
  static canTransition(from: ProjectStatus, to: ProjectStatus): boolean {
    if (from === to) return true;
    return TRANSITIONS[from]?.includes(to) ?? false;
  }

  static assertTransition(from: ProjectStatus, to: ProjectStatus): void {
    if (!this.canTransition(from, to)) {
      throw new InvalidStateTransitionError(`Cannot transition project from ${from} to ${to}`);
    }
  }

  static isTerminal(status: ProjectStatus): boolean {
    return TRANSITIONS[status].length === 0;
  }
}
