import { describe, expect, it } from "vitest";
import { ASSISTANT_LABEL_MARK, splitUndoLabel } from "./undoLabel";

describe("undo labels", () => {
  it("tells the assistant's steps from the user's", () => {
    expect(splitUndoLabel("Создать браш")).toEqual({ assistant: false, text: "Создать браш" });
    expect(splitUndoLabel(`${ASSISTANT_LABEL_MARK}Создать браш`)).toEqual({ assistant: true, text: "Создать браш" });
  });
});
