const argv = process.argv.slice(2);
const modelIndex = argv.indexOf("-m");
const model = modelIndex < 0 ? undefined : argv[modelIndex + 1];
const prompt = argv.at(-1) ?? "";

const startMarker = "[TASK FROM DSH]\n";
const endMarker = "\n[END TASK]";
const start = prompt.indexOf(startMarker);
const end = start < 0 ? -1 : prompt.indexOf(endMarker, start + startMarker.length);
const task = start < 0 || end < 0 ? prompt : prompt.slice(start + startMarker.length, end);

if (task.includes("EXIT_NONZERO")) {
  process.stderr.write("failed");
  process.exitCode = 3;
} else if (task.includes("QUOTA")) {
  process.stderr.write("Free usage exceeded. Add credits");
  process.exitCode = 1;
} else if (task.includes("EMPTY")) {
  process.stdout.write(`${JSON.stringify({ type: "step_start", part: { type: "step-start" } })}\n`);
  process.stdout.write(`${JSON.stringify({ type: "step_finish", reason: "stop", tokens: { total: 1, input: 1, output: 0, cache: { write: 0, read: 0 } }, cost: 0 })}\n`);
} else {
  process.stdout.write(`${JSON.stringify({ type: "step_start", part: { type: "step-start" } })}\n`);
  process.stdout.write(`${JSON.stringify({ type: "text", part: { type: "text", text: `echo: ${task}` } })}\n`);
  process.stdout.write(`${JSON.stringify({ type: "step_finish", reason: "stop", tokens: { total: 2, input: 1, output: 1, cache: { write: 0, read: 0 } }, cost: 0 })}\n`);
}
