// Arithmetic in number fields, as in Blender and Unity: "128*3" or
// "(64+32)/2" is worked out, and "+64", "*2", "/2" act on the value the
// field holds. Hammer takes only a plain number. Parsed by hand: no eval.

/** The number `text` stands for, or null when it is not a valid expression. `current` is the field's value for "+64", "*2" and "/2". */
export function evalNumber(text: string, current: number): number | null {
  const t = text.trim().replace(/,/g, ".");
  if (!t) return null;
  // A leading +, * or / means "change what is there"; a leading minus stays a negative number.
  const rel = /^[+*/]/.test(t) ? t[0] : null;
  const src = rel ? `${current}${t}` : t;
  let i = 0;
  const peek = () => src[i];
  const skip = () => {
    while (src[i] === " ") i++;
  };
  const num = (): number | null => {
    skip();
    if (peek() === "(") {
      i++;
      const v = sum();
      skip();
      if (v === null || peek() !== ")") return null;
      i++;
      return v;
    }
    if (peek() === "-" || peek() === "+") {
      const sign = peek() === "-" ? -1 : 1;
      i++;
      const v = num();
      return v === null ? null : sign * v;
    }
    const m = /^\d*\.?\d+(?:e[+-]?\d+)?/i.exec(src.slice(i));
    if (!m) return null;
    i += m[0].length;
    return Number(m[0]);
  };
  const product = (): number | null => {
    let v = num();
    for (;;) {
      skip();
      const op = peek();
      if (v === null || (op !== "*" && op !== "/")) return v;
      i++;
      const r = num();
      if (r === null) return null;
      v = op === "*" ? v * r : v / r;
    }
  };
  function sum(): number | null {
    let v = product();
    for (;;) {
      skip();
      const op = peek();
      if (v === null || (op !== "+" && op !== "-")) return v;
      i++;
      const r = product();
      if (r === null) return null;
      v = op === "+" ? v + r : v - r;
    }
  }
  const v = sum();
  skip();
  if (v === null || i !== src.length || !Number.isFinite(v)) return null;
  return Math.round(v * 1e6) / 1e6;
}
