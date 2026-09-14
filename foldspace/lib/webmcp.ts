import type { WorldHandle } from "./world";
type Tool = {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
type Registry = {
  registerTool: (
    tool: Tool,
    options: { signal: AbortSignal },
  ) => void | Promise<void>;
};
export function registerGameTools(
  world: WorldHandle,
  onStart: () => void,
): () => void {
  const registry = (document as Document & { modelContext?: Registry })
    .modelContext;
  if (!registry?.registerTool) return () => {};
  const lifecycle = new AbortController();
  const tools: Tool[] = [
    {
      name: "read_foldspace_state",
      title: "Read Foldspace",
      description:
        "Read the current room, nearby control, selected destinations and earned puzzle progress.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== "object" || Object.keys(input).length)
          throw new Error("Use an empty object.");
        return world.session.view();
      },
    },
    {
      name: "start_foldspace",
      title: "Enter Foldspace",
      description:
        "Start or resume the playable game at its current checkpoint. Does not solve puzzles or clear progress.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input) {
        if (!input || typeof input !== "object" || Object.keys(input).length)
          throw new Error("Use an empty object.");
        onStart();
        return { started: true, room: world.session.state.room };
      },
    },
  ];
  for (const tool of tools) {
    try {
      void Promise.resolve(
        registry.registerTool(tool, { signal: lifecycle.signal }),
      ).catch(() => {});
    } catch {
      /* Experimental browser capability is optional. */
    }
  }
  return () => lifecycle.abort();
}
