import { copyFile, mkdir, rm } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const publicSource = new URL("public/", root);
const publicTarget = new URL("dist/public/", root);

await rm(new URL("dist/", root), { recursive: true, force: true });
await mkdir(publicTarget, { recursive: true });
await Promise.all(
  ["index.html", "styles.css"].map((filename) =>
    copyFile(new URL(filename, publicSource), new URL(filename, publicTarget))
  )
);
