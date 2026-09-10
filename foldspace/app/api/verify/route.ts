import { verifyReplay } from "@/lib/game";
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length")) > 16384)
    return Response.json({ error: "Replay is too large." }, { status: 413 });
  const reader = request.body?.getReader();
  if (!reader)
    return Response.json({ error: "A replay is required." }, { status: 400 });
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 16384) {
        await reader.cancel();
        return Response.json(
          { error: "Replay is too large." },
          { status: 413 },
        );
      }
      chunks.push(part.value);
    }
    const data = new Uint8Array(size);
    let offset = 0;
    for (const c of chunks) {
      data.set(c, offset);
      offset += c.length;
    }
    const value = JSON.parse(new TextDecoder().decode(data));
    const result = verifyReplay(value.actions);
    return Response.json(
      {
        ...result,
        scope: "Puzzle rules only; movement and timing are not authenticated.",
      },
      {
        status: result.ok ? 200 : 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch {
    return Response.json(
      { error: "Provide valid JSON with an actions array." },
      { status: 400 },
    );
  }
}
