import fs from "node:fs";
import path from "node:path";
import NewsApp from "./NewsApp";

function loadLatest() {
  const dir = path.join(process.cwd(), "data");
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse();
  for (const f of files) {
    try {
      return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
    } catch {}
  }
  // Fallback to the bundled sample if no dated file parses.
  return JSON.parse(fs.readFileSync(path.join(dir, "2026-11-04.json"), "utf8"));
}

export default function Page() {
  const data = loadLatest();
  return <NewsApp data={data} />;
}
