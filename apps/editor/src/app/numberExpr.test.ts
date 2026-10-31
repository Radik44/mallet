import { describe, expect, it } from "vitest";
import { evalNumber } from "./numberExpr";

describe("number field arithmetic", () => {
  it("reads plain and negative numbers, with a comma too", () => {
    expect(evalNumber("128", 0)).toBe(128);
    expect(evalNumber("-32", 10)).toBe(-32);
    expect(evalNumber("1,5", 0)).toBe(1.5);
  });

  it("works out expressions with precedence and brackets", () => {
    expect(evalNumber("128*3", 0)).toBe(384);
    expect(evalNumber("(64+32)/2", 0)).toBe(48);
    expect(evalNumber("10 - 2 * 3", 0)).toBe(4);
  });

  it("acts on the current value after a leading + * /", () => {
    expect(evalNumber("+64", 100)).toBe(164);
    expect(evalNumber("*2", 100)).toBe(200);
    expect(evalNumber("/4", 100)).toBe(25);
  });

  it("refuses junk and division by zero", () => {
    expect(evalNumber("abc", 0)).toBeNull();
    expect(evalNumber("2+", 0)).toBeNull();
    expect(evalNumber("1/0", 0)).toBeNull();
    expect(evalNumber("", 0)).toBeNull();
    expect(evalNumber("alert(1)", 0)).toBeNull();
  });
});
