import fs from "node:fs";
import path from "node:path";
import NewsApp from "./NewsApp";

function loadSample() {
  const file = path.join(process.cwd(), "data", "2026-11-04.json");
  const raw = fs.readFileSync(file, "utf8");
  return JSON.parse(raw);
}

export default function Page() {
  const data = loadSample();
  return <NewsApp data={data} />;
}
