export const STYLES = {
  dream: 'a hand-painted dreamscape, soft watercolor, luminous sky, preserve the composition and main subject',
  ink: 'an elegant black and cream ink illustration, graphic novel linework, preserve the composition and main subject',
  neon: 'a cinematic neon illustration, teal and violet light, preserve the composition and main subject',
  thermal: 'an artistic thermal color palette, violet shadows and amber highlights, preserve the composition and main subject'
} as const;
export type RenderInput = { requestId: string; createdAt: number; image: string; style: keyof typeof STYLES };
export const MAX_BODY = 400_000;
export function validateRender(input: unknown, now = Date.now()): RenderInput {
  if (!input || typeof input !== 'object') throw new Error('Choose a still image first.');
  const x = input as Record<string, unknown>;
  if (Object.keys(x).some(k => !['requestId','createdAt','image','style'].includes(k))) throw new Error('Unexpected request fields.');
  if (typeof x.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x.requestId)) throw new Error('Invalid request identifier.');
  if (typeof x.createdAt !== 'number' || !Number.isSafeInteger(x.createdAt) || Math.abs(now-x.createdAt)>120_000) throw new Error('This still request expired. Prepare a new request.');
  if (typeof x.style !== 'string' || !Object.hasOwn(STYLES,x.style)) throw new Error('Select a supported style.');
  if (typeof x.image !== 'string' || x.image.length < 100 || x.image.length>360_000 || x.image.length%4!==0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(x.image)) throw new Error('Use a small JPEG or PNG still.');
  const bytes = Uint8Array.from(atob(x.image),c=>c.charCodeAt(0));
  const png=bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71;
  const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  if (!png&&!jpeg) throw new Error('Use a JPEG or PNG still.');
  return x as RenderInput;
}

export async function readBounded(request: Request, limit=MAX_BODY): Promise<string> {
  if (Number(request.headers.get('Content-Length'))>limit) throw new Error('Image request is too large.');
  if (!request.body) throw new Error('Missing image.');
  const reader=request.body.getReader();const parts:Uint8Array[]=[];let size=0;
  try { for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new Error('Image request is too large.');}parts.push(value);} }
  finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return new TextDecoder().decode(bytes);
}
