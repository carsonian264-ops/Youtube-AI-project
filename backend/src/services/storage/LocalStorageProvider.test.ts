import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { LocalStorageProvider } from "./LocalStorageProvider";

describe("LocalStorageProvider path boundary", () => {
  let root: string;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "storage-test-"));
    provider = new LocalStorageProvider(root);
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it("allows a normal nested key", async () => {
    const result = await provider.upload({ key: "projects/p1/image/a.png", data: Buffer.from("x"), contentType: "image/png" });
    expect(result.key).toBe("projects/p1/image/a.png");
    await expect(fs.readFile(path.join(root, "projects/p1/image/a.png"))).resolves.toEqual(Buffer.from("x"));
  });

  it("rejects a key that escapes the root via ..", async () => {
    await expect(provider.upload({ key: "../escaped.png", data: Buffer.from("x"), contentType: "image/png" })).rejects.toThrow(
      /outside storage root/,
    );
  });

  it("rejects a key resolving into a sibling directory that merely shares the root as a string prefix", async () => {
    // e.g. root "/tmp/storage-test-abc" vs a resolved path under
    // "/tmp/storage-test-abc-evil" -- the naive `startsWith` check this
    // regression-tests against would have wrongly allowed this.
    const siblingKey = `../${path.basename(root)}-evil/x.png`;
    await expect(provider.upload({ key: siblingKey, data: Buffer.from("x"), contentType: "image/png" })).rejects.toThrow(
      /outside storage root/,
    );
  });

  it("allows a key equal to the root itself to resolve without throwing on the boundary check", async () => {
    // Degenerate case: key "." resolves to the root directory exactly.
    await expect(provider.resolveLocalPath(".")).resolves.toBe(root);
  });
});
