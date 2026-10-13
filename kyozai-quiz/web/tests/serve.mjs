// 手元確認・E2E 用の静的サーバー。web/ をルートに配り、/samples/ は ../samples/ を配る（Pages と同じ配置）。
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation", ".pdf": "application/pdf", ".png": "image/png" };
const port = Number(process.env.PORT || 4173);

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path.endsWith("/")) path += "index.html";
  const file = path.startsWith("/samples/") ? join(root, "..", normalize(path)) : join(root, normalize(path));
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, () => console.log(`http://localhost:${port}/`));
