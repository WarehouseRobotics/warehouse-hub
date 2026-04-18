import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(currentDir, "../../data/uploads");
const keepFile = path.join(uploadsDir, ".keep");

async function main() {
  await mkdir(uploadsDir, { recursive: true });

  const entries = await readdir(uploadsDir);

  await Promise.all(
    entries
      .filter((entry) => entry !== ".keep")
      .map((entry) =>
        rm(path.join(uploadsDir, entry), {
          recursive: true,
          force: true
        })
      )
  );

  await writeFile(keepFile, "", "utf8");
}

await main();
