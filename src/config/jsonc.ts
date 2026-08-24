// Normalizes JSONC (comments + trailing commas) into plain JSON.
export function stripJsoncComments(source: string): string {
  let output = ""; let quoted = false; let escaped = false;
  for (let i = 0; i < source.length; i += 1) { const c = source[i] ?? ""; const n = source[i + 1] ?? "";
    if (quoted) { output += c; if (escaped) escaped = false; else if (c === "\\") escaped = true; else if (c === '"') quoted = false; continue; }
    if (c === '"') { quoted = true; output += c; continue; }
    if (c === "/" && n === "/") { while (i < source.length && source[i] !== "\n") i += 1; if (source[i] === "\n") output += "\n"; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) { if (source[i] === "\n") output += "\n"; i += 1; } i += 1; continue; }
    if (c === ",") { let j = i + 1; while (j < source.length && (source[j] === " " || source[j] === "\t" || source[j] === "\n" || source[j] === "\r")) j += 1; if (source[j] === "}" || source[j] === "]") continue; }
    output += c;
  } return output;
}