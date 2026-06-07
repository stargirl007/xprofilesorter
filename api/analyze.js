import { handleAnalyze } from "../server.js";

export default async function handler(req, res) {
  return handleAnalyze(req, res);
}
