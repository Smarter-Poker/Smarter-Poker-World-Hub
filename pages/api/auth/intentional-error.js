import { fake } from "nonexistent-module-for-testing-autofix-pipeline";

export default function handler(req, res) {
  res.status(200).json({ ok: fake() });
}
