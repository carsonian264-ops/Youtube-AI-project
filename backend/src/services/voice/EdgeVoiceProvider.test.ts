import { ProviderError } from "@/utils/errors";

jest.mock("@travisvn/edge-tts", () => ({
  // Simulates the real-world failure mode this test guards against: the
  // WebSocket handshake to Microsoft's TTS endpoint stalls and the
  // library's synthesize() promise never settles.
  EdgeTTS: jest.fn().mockImplementation(() => ({
    synthesize: () => new Promise(() => undefined),
  })),
}));

import { EdgeVoiceProvider } from "./EdgeVoiceProvider";

describe("EdgeVoiceProvider", () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it("fails with a retryable error instead of hanging forever when the connection stalls", async () => {
    jest.useFakeTimers();
    const provider = new EdgeVoiceProvider();

    const resultPromise = provider.generateSpeech({ text: "hello" });
    const advancing = jest.advanceTimersByTimeAsync(20_000);

    let caught: unknown;
    try {
      await resultPromise;
    } catch (err) {
      caught = err;
    }
    await advancing;

    expect(caught).toBeInstanceOf(ProviderError);
    const error = caught as ProviderError;
    expect(error.message).toMatch(/did not respond within/);
    expect(error.retryable).toBe(true);
  });
});
