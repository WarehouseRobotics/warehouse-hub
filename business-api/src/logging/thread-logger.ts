import { safeJsonStringify } from "./safe-json.js";

type LegacyMessage = {
  role: string;
  content: string;
};

const resolveLlmTraceUrl = () => {
  return process.env.WROBO_LLM_TRACE_URL || "http://host.docker.internal:9797/log";
};

function formatMessagesForLegacy(
  messages: { content: string | unknown[]; role: string }[],
): LegacyMessage[] {
  return messages.map((message) => {
    let content = "";

    if (typeof message.content === "string") {
      content = message.content;
    } else if (Array.isArray(message.content)) {
      content = message.content
        .map((item: any) => {
          if (item.type === "text") {
            return item.text;
          }
          if (item.type === "image_url") {
            return "[image]";
          }
          return "";
        })
        .filter(Boolean)
        .join("\n");
    }

    return {
      role: message.role,
      content,
    };
  });
}

/**
 * Legacy batch shape for log viewers that expect `{ streamName, messages }`.
 * Prefer `postLlmTraceEvent` with structured `eventType` for new integrations.
 */
export const logMessagesToStreamLogger = async ({
  messages,
  name,
}: {
  messages: { content: string | unknown[]; role: string }[];
  name: string;
}): Promise<boolean> => {
  const url = resolveLlmTraceUrl();
  if (!url) {
    return false;
  }

  const formattedMessages = formatMessagesForLegacy(messages);

  const payload = {
    streamName: name,
    messages: formattedMessages,
  };

  const body = safeJsonStringify(payload);
  if (!body) {
    return false;
  }

  try {
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
      body,
    });
    if (!res.ok) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
};
