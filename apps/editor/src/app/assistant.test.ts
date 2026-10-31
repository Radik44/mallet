import { describe, expect, it } from "vitest";
import { assistantTurn, cliTurn, mockBackend, type AssistantContext, type AssistantEvent, type Backend, type CliEvent, type CliRunner, type Message, type ToolOutcome } from "./assistant";
import { mcpReply } from "./assistantCli";
import { diffText } from "./assistantTools";

describe("assistant", () => {
  it("runs the demo backend's tools and feeds results back until it stops", async () => {
    const calls: string[] = [];
    let nextId = 10;
    const ctx: AssistantContext = {
      summary: () => "Карта: пусто",
      runTool: async (name, input) => {
        calls.push(name);
        if (name === "create_brush") return { result: `браш: Создать блок, id ${nextId++}`, edited: true };
        if (name === "hollow_brushes") return { result: `полые браши ${JSON.stringify(input.ids)}`, edited: true };
        if (name === "create_entity") return { result: `${input.classname}: id ${nextId++}`, edited: true };
        return { result: "?", error: true };
      },
    };
    const events: AssistantEvent[] = [];
    const messages: Message[] = [{ role: "user", content: "сделай комнату" }];
    const r = await assistantTurn(messages, "claude-sonnet-5-5", mockBackend, ctx, (e) => events.push(e));
    expect(calls).toEqual(["create_brush", "hollow_brushes", "create_entity", "create_entity"]);
    expect(r.edits).toBe(4);
    expect(r.steps).toBe(3);
    // The hollow call got the id the brush tool reported.
    const hollow = events.find((e) => e.kind === "tool" && e.name === "hollow_brushes");
    expect(hollow && hollow.kind === "tool" ? hollow.input.ids : null).toEqual([10]);
    expect(events.filter((e) => e.kind === "text").length).toBe(2);
    // The conversation alternates and ends with the assistant's report.
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant", "user", "assistant"]);
    const last = messages[messages.length - 1];
    expect(typeof last.content !== "string" && last.content[0].type === "text" && last.content[0].text.startsWith("Готово")).toBe(true);
  });

  it("stops when asked and reports the refusal to the model", async () => {
    const stop = { current: false };
    const ctx: AssistantContext = {
      summary: () => "",
      runTool: async () => {
        stop.current = true;
        return { result: "ok", edited: true };
      },
    };
    const r = await assistantTurn([{ role: "user", content: "x" }], "m", mockBackend, ctx, () => {}, stop);
    expect(r.steps).toBe(1);
    expect(r.edits).toBe(1);
  });

  it("runs a streamed tool call as soon as its block is complete, before the reply ends", async () => {
    const order: string[] = [];
    let turn = 0;
    const use = { type: "tool_use" as const, id: "t1", name: "create_brush", input: { min: [0, 0, 0], max: [64, 64, 64] } };
    const backend: Backend = async (_req, onDelta) => {
      turn++;
      if (turn === 1) {
        onDelta?.({ kind: "block_start", type: "text" });
        onDelta?.({ kind: "text", text: "Строю " });
        onDelta?.({ kind: "text", text: "блок" });
        onDelta?.({ kind: "block_start", type: "tool_use", name: use.name });
        onDelta?.({ kind: "tool_use", id: use.id, name: use.name, input: use.input });
        await new Promise((r) => setTimeout(r, 30));
        order.push("reply-end");
        return { content: [{ type: "text", text: "Строю блок" }, use], stopReason: "tool_use", inputTokens: 1, outputTokens: 2 };
      }
      return { content: [{ type: "text", text: "Готово" }], stopReason: "end_turn", inputTokens: 1, outputTokens: 1 };
    };
    const ctx: AssistantContext = {
      summary: () => "",
      runTool: async (name) => {
        order.push(`tool:${name}`);
        return { result: "браш: id 7", edited: true, ids: [7] };
      },
    };
    const events: AssistantEvent[] = [];
    const messages: Message[] = [{ role: "user", content: "блок" }];
    const r = await assistantTurn(messages, "m", backend, ctx, (e) => events.push(e));
    // The tool ran while the model was still "typing" the rest of the reply.
    expect(order).toEqual(["tool:create_brush", "reply-end"]);
    expect(events.map((e) => e.kind)).toEqual(["text_delta", "text_delta", "text_end", "tool_pending", "tool_start", "tool", "usage", "usage", "text"]);
    const tool = events.find((e) => e.kind === "tool");
    expect(tool && tool.kind === "tool" ? tool.ids : null).toEqual([7]);
    expect(r.edits).toBe(1);
    // The result went back under the call's id, once.
    const res = messages[2];
    expect(typeof res.content !== "string" && res.content.length === 1 && res.content[0].type === "tool_result" && res.content[0].tool_use_id === "t1").toBe(true);
  });

  it("runs Claude Code's tool calls as they arrive and answers them before the run ends", async () => {
    const order: string[] = [];
    const replies: { callId: string; out: ToolOutcome }[] = [];
    let seenResume: string | null | undefined;
    const prompts: string[] = [];
    const runner: CliRunner = {
      run: async (req, on) => {
        seenResume = req.resume;
        prompts.push(req.prompt);
        expect(req.tools.some((t) => t.name === "create_brush")).toBe(true);
        expect(req.system).toContain("Язык интерфейса");
        if (prompts.length > 1) {
          // A follow-up carries only what changed, not the whole summary again.
          on({ kind: "done", isError: false, subtype: "success", result: "Ещё", sessionId: "sess-1", inputTokens: 1, outputTokens: 1, numTurns: 1 });
          return;
        }
        expect(req.prompt).toContain("Карта: пусто");
        expect(req.prompt).toContain("поставь блок");
        const emit = (e: CliEvent) => on(e);
        emit({ kind: "session", id: "sess-1" });
        emit({ kind: "block_start", type: "text" });
        emit({ kind: "text", text: "Ставлю " });
        emit({ kind: "text", text: "блок" });
        emit({ kind: "block_stop" });
        emit({ kind: "block_start", type: "tool_use", name: "create_brush" });
        emit({ kind: "json", text: "{}" });
        emit({ kind: "block_stop" });
        emit({ kind: "tool_call", callId: "call_1", name: "create_brush", input: { min: [0, 0, 0], max: [64, 64, 64] } });
        // The CLI waits for the answer before it goes on.
        while (!replies.length) await new Promise((r) => setTimeout(r, 5));
        order.push("cli-continues");
        emit({ kind: "block_start", type: "text" });
        emit({ kind: "text", text: "Готово" });
        emit({ kind: "block_stop" });
        emit({ kind: "done", isError: false, subtype: "success", result: "Готово", sessionId: "sess-1", inputTokens: 100, outputTokens: 20, numTurns: 2 });
      },
      reply: async (callId, out) => {
        replies.push({ callId, out });
      },
      stop: async () => {},
      reset: async () => {},
    };
    const ctx: AssistantContext = {
      summary: () => "Карта: пусто",
      brief: (since) => `Правки с прошлого запроса начиная с ${since}`,
      undoDepth: () => 7,
      runTool: async (name) => {
        order.push(`tool:${name}`);
        return { result: "браш: id 3", edited: true, ids: [3] };
      },
    };
    const events: AssistantEvent[] = [];
    const session = { id: null as string | null, turns: 0, depth: 0 };
    const r = await cliTurn("поставь блок", "claude-sonnet-5-5", runner, ctx, (e) => events.push(e), undefined, session);
    expect(seenResume).toBe(null);
    expect(order).toEqual(["tool:create_brush", "cli-continues"]);
    expect(replies[0].callId).toBe("call_1");
    expect(mcpReply(replies[0].out)).toEqual({ content: [{ type: "text", text: "браш: id 3" }], isError: false });
    expect(events.map((e) => e.kind)).toEqual(["text_delta", "text_delta", "text_end", "tool_pending", "tool_start", "tool", "text_delta", "text_end", "usage"]);
    expect(r).toEqual({ edits: 1, steps: 1, text: "Готово", cost: 0 });
    expect(session.id).toBe("sess-1");
    expect(session.turns).toBe(1);
    expect(session.depth).toBe(7);
    const r2 = await cliTurn("ещё", "claude-sonnet-5-5", runner, ctx, () => {}, undefined, session);
    expect(r2.text).toBe("Ещё");
    expect(prompts[1]).toContain("Правки с прошлого запроса начиная с 7");
    expect(prompts[1]).not.toContain("Карта: пусто");
    expect(session.turns).toBe(2);
  });

  it("diffs scripts line by line with context", () => {
    const d = diffText("a\nb\nc\nd\ne\nf\ng\nh", "a\nb\nc\nX\ne\nf\ng\nh");
    expect(d.split("\n")).toEqual(["…", " b", " c", "-d", "+X", " e", " f", "…"]);
    expect(diffText("", "new").trim()).toBe("+new");
  });
});
