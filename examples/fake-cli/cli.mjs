// Minimal fake agent CLI shipped with dsh-agent-gateway for the public smoke test.
// Emulates a read-only specialist: echoes the task back as a success envelope so
// users can exercise list_agents / call_agent / get_agent_status without
// installing any real AI CLI. `--mode success` is the only mode the shipped
// example config uses.
const args = process.argv.slice(2);
const value = (flag) => args[args.indexOf(flag) + 1];
const mode = value("--mode") ?? "success";
const task = value("--task") ?? "";

if (mode === "exit-nonzero") {
  process.stderr.write("fake CLI failed\n");
  process.exitCode = 3;
} else if (mode === "unicode") {
  process.stdout.write(JSON.stringify({ status: "success", response: "Tiếng Việt có dấu: ă â đ ê ô ơ ư", modelReported: "fake-1" }));
} else {
  process.stdout.write(JSON.stringify({ status: "success", response: `echo: ${task}`, modelReported: "fake-1" }));
}
