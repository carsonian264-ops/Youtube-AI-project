import type { Scene } from "@/generated/prisma";

/** Builds an SRT caption file from scenes' narration text and planned timing. */
export class CaptionService {
  buildSrt(scenes: Pick<Scene, "sceneNumber" | "narration" | "durationSeconds">[]): string {
    let cursor = 0;
    const blocks = scenes
      .slice()
      .sort((a, b) => a.sceneNumber - b.sceneNumber)
      .map((scene, index) => {
        const start = cursor;
        const end = cursor + Math.max(scene.durationSeconds, 1);
        cursor = end;
        return [
          String(index + 1),
          `${formatTimestamp(start)} --> ${formatTimestamp(end)}`,
          scene.narration.trim(),
          "",
        ].join("\n");
      });
    return blocks.join("\n");
  }
}

function formatTimestamp(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const millis = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(millis, 3)}`;
}

export const captionService = new CaptionService();
