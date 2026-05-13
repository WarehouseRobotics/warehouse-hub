import { runCli } from "./cli/index.js";
import { isWrapperCliInvocation } from "./cli/core.js";
import { formatCliErrorAsMarkdown } from "./lib/cli-error-format.js";
import { logger } from "./lib/logger.js";

runCli(process.argv.slice(2)).catch((error) => {
  const positionalArgs = process.argv
    .slice(2)
    .filter((arg) => arg !== "--in-docker" && arg !== "--verbose");
  const command = positionalArgs.join(" ");

  if (isWrapperCliInvocation()) {
    process.stderr.write(`${formatCliErrorAsMarkdown(command, error)}\n`);
  } else {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("Business API CLI command failed", {
      command,
      error,
    });
    process.stderr.write(`${message}\n`);
  }

  process.exitCode = 1;
});
