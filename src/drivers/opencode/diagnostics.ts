const MAX_DIAGNOSTICS_CHARS = 4000;

export function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

export function truncateDiagnostics(value: string, maxChars = MAX_DIAGNOSTICS_CHARS): string {
  if (value.length <= maxChars) return value;
  const head = Math.floor(maxChars * 0.6);
  const tail = maxChars - head;
  return `${value.slice(0, head)}\n...[truncated ${value.length - maxChars} chars]...\n${value.slice(-tail)}`;
}
