import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
if (process.env.GITHUB_ACTIONS !== "true") throw new Error("Integration browser fixtures run only in GitHub Actions.");
const bundled = await build({ entryPoints: ["scripts/integration-preview/fixture.tsx"], bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' }, alias: { "@": resolve("src"), "next/link": resolve("scripts/integration-preview/next-link.tsx"), "next/navigation": resolve("scripts/integration-preview/next-navigation.ts") } });
const css = (await postcss([tailwind()]).process(await readFile("src/app/globals.css", "utf8"), { from: resolve("src/app/globals.css") })).css;
const html = '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>UNIFY integration preview</title><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>';
createServer((req, res) => {
  const path = new URL(req.url, "http://127.0.0.1").pathname;
  res.setHeader("Content-Type", path === "/fixture.js" ? "text/javascript" : path === "/fixture.css" ? "text/css" : "text/html");
  res.end(path === "/fixture.js" ? bundled.outputFiles[0].text : path === "/fixture.css" ? css : html);
}).listen(4173, "127.0.0.1");
