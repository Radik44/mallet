import { describe, expect, it } from "vitest";
import { analyzeCompileLog, askAboutLog, autoFixPlan } from "./compileIssues";

describe("compile issues", () => {
  it("recognises leaks, skyboxes, materials, broken brushes and Lua errors", () => {
    const lines = [
      "[vbsp] Entity light (0.00 0.00 160.00) leaked!",
      "[vbsp] *** Error: Skybox vtf files for skybox/sky_day01_01 weren't compiled with the same size texture and/or same flags!",
      "[vbsp] material CUSTOM/WALL_OLD not found",
      "[vbsp] Brush 47: non-convex",
      "[vrad] 0 errors",
      "[game] [ERROR] addons/mallet_room/lua/autorun/server/door.lua:12: attempt to index a nil value",
      "[game] stack traceback:",
    ];
    const issues = analyzeCompileLog(lines);
    const ids = issues.map((i) => i.id);
    expect(ids).toContain("leak");
    expect(ids).toContain("skybox");
    expect(ids).toContain("material:custom/wall_old");
    expect(ids).toContain("brush:47");
    expect(ids).toContain("lua");
    expect(issues.find((i) => i.id === "skybox")!.fix!.kind).toBe("env_cubemap");
    expect(issues.find((i) => i.id === "material:custom/wall_old")!.fix!.arg).toBe("CUSTOM/WALL_OLD");
    expect(issues.find((i) => i.id === "brush:47")!.fix!.arg).toBe(47);
    expect(issues.find((i) => i.id === "lua")!.lines.length).toBe(2);
    expect(issues.find((i) => i.id === "leak")!.explain).toMatch(/light/);
    const ask = askAboutLog(issues, lines);
    expect(ask).toMatch(/Утечка/);
    expect(ask).toMatch(/leaked!/);
    expect(ask).not.toMatch(/0 errors/);
  });

  it("plans only the safe fixes, once per kind and argument", () => {
    const issues = analyzeCompileLog([
      "[vbsp] **** leaked ****",
      "[vbsp] *** Error: Skybox vtf files for skybox/sky_day01_01 weren't compiled with the same size texture and/or same flags!",
      "[vbsp] material NATURE/ROCK_A not found",
      "[vbsp] material NATURE/ROCK_A not found",
    ]);
    const plan = autoFixPlan(issues);
    expect(plan.map((i) => i.fix!.kind)).toEqual(["env_cubemap", "replace_material"]);
    expect(plan.some((i) => i.fix!.kind === "show_leak")).toBe(false);
  });

  it("stays quiet on a clean log", () => {
    expect(analyzeCompileLog(["[vbsp] Writing map.bsp", "[vrad] 0 errors, 0 warnings", "[game] Map loaded"])).toEqual([]);
  });
});
