import { handleSync } from "../server.js";

export default async function handler(req, res) {
  return handleSync(req, res);
}
