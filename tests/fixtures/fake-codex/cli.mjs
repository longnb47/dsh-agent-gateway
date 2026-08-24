let prompt = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) prompt += chunk;

const startMarker = "[TASK FROM DSH]\n";
const endMarker = "\n[END TASK]";
const start = prompt.indexOf(startMarker);
const end = start < 0 ? -1 : prompt.indexOf(endMarker, start + startMarker.length);
const task = start < 0 || end < 0 ? "" : prompt.slice(start + startMarker.length, end);

if (task.includes("EXIT_NONZERO")) {
  process.stderr.write("failed");
  process.exitCode = 3;
} else if (!task.includes("EMPTY")) {
  process.stdout.write(`echo: ${task}`);
  process.stderr.write("OpenAI Codex v0.149.0\nworkdir: fixture\nmodel: fake-codex\nsandbox: read-only\ntokens used 1\n");
}
