import { ROOM_NAMES, ROOM_HINTS } from "@/lib/game";
export function GET() {
  return Response.json(
    {
      version: 1,
      rooms: ROOM_NAMES.map((name, id) => ({ id, name, hint: ROOM_HINTS[id] })),
      rules: ["Choose", "Carry", "Connect"],
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
