const prompt = process.argv[process.argv.indexOf("-p") + 1] ?? "";
const match = /\[TASK FROM DSH\]\n([\s\S]*?)\n\[END TASK\]/.exec(prompt);
const task = match?.[1] ?? "";
const option = (name) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};
if (task.includes("ECHO_OPTIONS")) {
  const response = JSON.stringify({ model: option("--model"), effort: option("--effort") });
  process.stdout.write(JSON.stringify({ status: "SUCCESS", response }));
} else if (task.includes("PERMISSION_DENIED")) {
  process.stdout.write('{"status":"ERROR","error":"permission check failed for command \\"Get-Location\\": user denied permission to run command:\\nGet-Location"}');
  process.exitCode = 1;
} else if (task.includes("INVALID_JSON")) {
  process.stdout.write("plain text, not an AGY envelope");
} else if (task.includes("EMPTY_RESPONSE")) {
  process.stdout.write('{"status":"SUCCESS","response":""}');
} else {
  process.stdout.write(`ERROR: logging before google.Init: boot\n{"status":"SUCCESS","response":${JSON.stringify(`echo: ${task}`)},"conversation_id":"c-1","duration_seconds":0.5,"usage":{"input_tokens":10,"output_tokens":5}}`);
}
