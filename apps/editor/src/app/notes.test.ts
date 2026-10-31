import { describe, expect, it } from "vitest";
import { addNote, removeNote, sortNotes, updateNote } from "./notes";

describe("notes", () => {
  it("adds with a fresh id and rounded position, edits, removes", () => {
    let list = addNote([], [1.234, -2, 3.999], "fix leak", 100);
    list = addNote(list, [0, 0, 0], "prop here", 200);
    expect(list.map((n) => n.id)).toEqual([1, 2]);
    expect(list[0].pos).toEqual([1.23, -2, 4]);
    list = updateNote(list, 1, { done: true });
    expect(list[0].done).toBe(true);
    list = removeNote(list, 2);
    expect(list).toHaveLength(1);
    // Ids are never reused while a higher one exists.
    expect(addNote(list, [0, 0, 0], "x").at(-1)!.id).toBe(2);
  });

  it("lists open notes first, newest first", () => {
    const list = [
      { id: 1, pos: [0, 0, 0] as [number, number, number], text: "a", done: true, when: 300 },
      { id: 2, pos: [0, 0, 0] as [number, number, number], text: "b", done: false, when: 100 },
      { id: 3, pos: [0, 0, 0] as [number, number, number], text: "c", done: false, when: 200 },
    ];
    expect(sortNotes(list).map((n) => n.id)).toEqual([3, 2, 1]);
  });
});
