import { handleRequest } from './server/handler';

// Only the runtime handler belongs in the entrypoint's public export map.
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return handleRequest(request, env.ASSETS);
  },
} satisfies ExportedHandler<Env>;
