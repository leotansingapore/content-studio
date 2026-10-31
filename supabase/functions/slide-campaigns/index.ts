// slide-campaigns: slideshow campaigns and image libraries; every rule is in api.ts.
import { handle } from "./api.ts";

Deno.serve((req) => handle(req));
