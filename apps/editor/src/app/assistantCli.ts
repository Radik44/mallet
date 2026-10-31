// Claude Code through the shell: the runner `cliTurn` drives. Tool results go
// back in MCP's shape (text, and a picture when the tool took one).

import { api } from "../tauri";
import type { CliRunner, ToolOutcome } from "./assistant";

/** A tool's outcome as an MCP tool result. */
export function mcpReply(out: ToolOutcome): unknown {
  const content: unknown[] = [{ type: "text", text: out.result }];
  if (out.image) content.push({ type: "image", data: out.image.data, mimeType: out.image.mediaType });
  return { content, isError: !!out.error };
}

export const shellCliRunner: CliRunner = {
  run: (req, onEvent) => api.assistantCliRun(req, onEvent),
  reply: async (callId, out) => {
    await api.assistantToolReply(callId, mcpReply(out));
  },
  stop: () => api.assistantCliStop(),
  reset: () => api.assistantCliReset(),
};
