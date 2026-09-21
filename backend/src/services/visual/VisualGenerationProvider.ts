export type VisualAspectRatio = "LANDSCAPE_16_9" | "PORTRAIT_9_16" | "SQUARE_1_1";

export interface GenerateImageInput {
  prompt: string;
  aspectRatio: VisualAspectRatio;
  /** Free-form style/consistency hints pulled from the project's Character/Visual Bible. */
  styleReference?: string;
  negativePrompt?: string;
}

export interface GeneratedMedia {
  data: Buffer;
  mimeType: string;
  provider: string;
  metadata?: Record<string, unknown>;
}

/**
 * Abstraction over "turn a text prompt into an image (or, if the provider
 * supports it, a short video clip)". The rest of the app only depends on
 * this interface -- never on OpenArt (or any other vendor) directly --
 * so the provider can be swapped by changing VISUAL_PROVIDER in .env.
 */
export interface VisualGenerationProvider {
  generateImage(input: GenerateImageInput): Promise<GeneratedMedia>;
}
