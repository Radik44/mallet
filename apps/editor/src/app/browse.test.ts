import { describe, expect, it } from "vitest";
import { requestBrowse, takeBrowse } from "./browse";

describe("browse to asset", () => {
  it("keeps a request for its own library only, and hands it out once", () => {
    globalThis.window ??= { dispatchEvent: () => true } as unknown as Window & typeof globalThis;
    requestBrowse("model", "models/props_c17/oildrum001.mdl");
    expect(takeBrowse("material")).toBeNull();
    expect(takeBrowse("model")).toBe("models/props_c17/oildrum001.mdl");
    expect(takeBrowse("model")).toBeNull();
  });
});
