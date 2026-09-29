import type { MusicMood } from "@/generated/prisma";

/** The subset of MusicMood that actually names a track -- NONE means "don't call this at all". */
export type PlayableMusicMood = Exclude<MusicMood, "NONE">;

/**
 * Produces a local background-music file for a mood. The only
 * implementation (GeneratedMusicProvider) synthesizes the track itself
 * with ffmpeg, so this works with no API key, no per-render cost, and no
 * licensing risk. The interface exists so a future "pick from a licensed
 * track library" provider could be swapped in without touching the
 * video-rendering worker.
 */
export interface MusicProvider {
  /** Returns the local filesystem path to a short, loopable music track for this mood. */
  getTrack(mood: PlayableMusicMood): Promise<string>;
}
