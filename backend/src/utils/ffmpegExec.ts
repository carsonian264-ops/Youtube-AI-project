import { spawn } from "node:child_process";
import { env } from "@/config/env";
import { ProviderError } from "@/utils/errors";
import { logger } from "@/utils/logger";

/** Runs ffmpeg with the given args, rejecting with a ProviderError on a non-zero exit. */
export function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    logger.debug({ args }, "Running ffmpeg");
    const proc = spawn(env.FFMPEG_PATH, args);
    let stderr = "";
    proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    proc.on("error", (err) => reject(new ProviderError("ffmpeg", err.message, false)));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new ProviderError("ffmpeg", `ffmpeg exited with code ${code}: ${stderr.slice(-2000)}`, false));
        return;
      }
      resolve();
    });
  });
}
