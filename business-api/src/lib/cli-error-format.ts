const TRUTHY_ENV_VALUES = new Set(["1", "t", "true", "yes", "on"]);

export function isTruthyEnvValue(value: string | undefined): boolean {
  return typeof value === "string" && TRUTHY_ENV_VALUES.has(value.trim().toLowerCase());
}

function getErrorSummary(error: unknown): { name?: string; message: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

function collectErrorChain(error: unknown): string[] {
  const messages: string[] = [];
  let current: unknown = error;

  while (current instanceof Error) {
    messages.push(current.message || current.name || "Unknown error");
    current = current.cause;
  }

  if (messages.length === 0) {
    messages.push(String(error));
  }

  return messages;
}

export function formatCliErrorAsMarkdown(command: string, error: unknown): string {
  const summary = getErrorSummary(error);
  const chain = collectErrorChain(error);
  const sections = [
    "# Business API CLI Error",
    "",
    "## Command",
    "",
    `\`${command || "(no command provided)"}\``,
    "",
    "## Error Type",
    "",
    `\`${summary.name ?? "Error"}\``,
    "",
    "## Error Message",
    "",
    summary.message,
  ];

  if (chain.length > 1) {
    sections.push("", "## Cause Chain", "");
    sections.push(...chain.map((message, index) => `${index + 1}. ${message}`));
  }

  if (summary.stack) {
    sections.push("", "## Stack Trace", "", "```text", summary.stack, "```");
  }

  sections.push("", "## Error Message Summary", "", summary.message);

  return sections.join("\n");
}
