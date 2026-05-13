import {
  commentInputSchema,
  commentPatchSchema,
  contactInputSchema,
  contactResolveInputSchema,
  dealInputSchema,
  projectInputSchema,
  taskInputSchema,
  taskPatchSchema,
  type CommentableType,
} from "@warehouse-hub/business-schemas";

import { createComment, getComment, listComments, updateComment } from "../../services/comments.js";
import { createContact, getContact, listContacts, resolveContact } from "../../services/contacts.js";
import { createDeal, getDeal, listDeals } from "../../services/deals.js";
import { createProject, getProject, listProjects } from "../../services/projects.js";
import { createTask, getTask, listTasks, updateTask } from "../../services/tasks.js";
import { parseJsonArg, throwUnknownCommand, type CliCommandDefinition } from "../core.js";

function parseCommentListFilters(args: string[]): {
  commentableType?: CommentableType;
  commentableId?: string;
  commentableSlug?: string;
  authorContactId?: string;
} {
  const values: Record<string, string | undefined> = {};
  const allowedKeys = new Set(["commentable-type", "commentable-id", "commentable-slug", "author-contact-id"]);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg?.startsWith("--")) {
      throw new Error(`Unknown list option: ${arg}`);
    }

    const key = arg.slice(2);
    if (!allowedKeys.has(key)) {
      throw new Error(`Unknown list option: ${arg}`);
    }

    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for option: ${arg}`);
    }

    if (values[key] !== undefined) {
      throw new Error(`Duplicate list option for '${key}': ${arg}`);
    }

    values[key] = value;
    index += 1;
  }

  const commentableType = values["commentable-type"];
  if (
    commentableType !== undefined &&
    commentableType !== "company_card" &&
    commentableType !== "contact" &&
    commentableType !== "document" &&
    commentableType !== "expense" &&
    commentableType !== "payroll" &&
    commentableType !== "deal" &&
    commentableType !== "booking" &&
    commentableType !== "sales_invoice" &&
    commentableType !== "project" &&
    commentableType !== "task"
  ) {
    throw new Error(`Unsupported commentable type: ${commentableType}`);
  }

  return {
    commentableType,
    commentableId: values["commentable-id"],
    commentableSlug: values["commentable-slug"],
    authorContactId: values["author-contact-id"],
  };
}

export const commandDefinitions: CliCommandDefinition[] = [
  {
    scope: "comments",
    aliases: ["comment"],
    help: {
      description: "Create, inspect, list, and update generic comments attached to business records.",
      commands: [
        "create <json>",
        "get <id-or-slug>",
        "list [--commentable-type <type>] [--commentable-id <id>] [--commentable-slug <slug>] [--author-contact-id <id>]",
        "update <id-or-slug> <json>",
      ],
      examples: [
        'comments create \'{"commentableType":"task","commentableSlug":"prepare-rollout","body":"Customer asked to delay by one week.","authorName":"Hub developer"}\'',
        "comments list --commentable-type task --commentable-id task_000123",
      ],
    },
    handler({ subcommand, rest, positionalArgs, context }) {
      if (subcommand === "create") {
        const input = commentInputSchema.parse(parseJsonArg(rest[0], "comment"));
        context.printJson(createComment(input));
        return;
      }

      if (subcommand === "get") {
        context.printJson(getComment(rest[0]));
        return;
      }

      if (subcommand === "list") {
        context.printJson(listComments(parseCommentListFilters(rest)));
        return;
      }

      if (subcommand === "update") {
        const input = commentPatchSchema.parse(parseJsonArg(rest[1], "comment patch"));
        context.printJson(updateComment(rest[0], input));
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
  {
    scope: "contacts",
    help: {
      description: "Create, inspect, list, or resolve contacts.",
      commands: ["list", "create <json>", "get <id-or-slug>", "resolve <json>"],
      examples: [
        "contacts list",
        'contacts create \'{"type":"company","status":"active","roles":["customer"],"displayName":"Acme Retail GmbH"}\'',
        'contacts resolve \'{"autoCreate":true,"matchBy":["taxId","email"],"contact":{"type":"company","displayName":"Acme Retail GmbH"}}\'',
      ],
    },
    handler({ subcommand, rest, positionalArgs, context }) {
      if (subcommand === "list") {
        context.printJson(listContacts());
        return;
      }

      if (subcommand === "create") {
        const input = contactInputSchema.parse(parseJsonArg(rest[0], "contact"));
        context.printJson(createContact(input));
        return;
      }

      if (subcommand === "get") {
        context.printJson(getContact(rest[0]));
        return;
      }

      if (subcommand === "resolve") {
        const input = contactResolveInputSchema.parse(parseJsonArg(rest[0], "contact resolve payload"));
        context.printJson(resolveContact(input));
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
  {
    scope: "deals",
    help: {
      description: "Create, inspect, and list sales deals.",
      commands: ["create <json>", "get <id-or-slug>", "list"],
      examples: ['deals create \'{"title":"Warehouse audit consulting","stage":"qualified"}\'', "deals list"],
    },
    handler({ subcommand, rest, positionalArgs, context }) {
      if (subcommand === "create") {
        const input = dealInputSchema.parse(parseJsonArg(rest[0], "deal"));
        context.printJson(createDeal(input));
        return;
      }

      if (subcommand === "get") {
        context.printJson(getDeal(rest[0]));
        return;
      }

      if (subcommand === "list") {
        context.printJson(listDeals());
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
  {
    scope: "projects",
    help: {
      description: "Create, inspect, and list projects.",
      commands: ["create <json>", "get <id-or-slug>", "list"],
      examples: ['projects create \'{"ownerEntityId":"comp_000001","name":"Customer onboarding"}\'', "projects list"],
    },
    handler({ subcommand, rest, positionalArgs, context }) {
      if (subcommand === "create") {
        const input = projectInputSchema.parse(parseJsonArg(rest[0], "project"));
        context.printJson(createProject(input));
        return;
      }

      if (subcommand === "get") {
        context.printJson(getProject(rest[0]));
        return;
      }

      if (subcommand === "list") {
        context.printJson(listProjects());
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
  {
    scope: "tasks",
    help: {
      description: "Create, inspect, list, and update tasks.",
      commands: ["create <json>", "get <id-or-slug>", "list", "update <id-or-slug> <json>"],
      examples: [
        'tasks create \'{"projectId":"proj_000101","title":"Review Q2 expense backlog","status":"todo","priority":"high"}\'',
        "tasks list",
        'tasks update task_000123 \'{"status":"done"}\'',
      ],
    },
    handler({ subcommand, rest, positionalArgs, context }) {
      if (subcommand === "create") {
        const input = taskInputSchema.parse(parseJsonArg(rest[0], "task"));
        context.printJson(createTask(input));
        return;
      }

      if (subcommand === "get") {
        context.printJson(getTask(rest[0]));
        return;
      }

      if (subcommand === "list") {
        context.printJson(listTasks());
        return;
      }

      if (subcommand === "update") {
        const input = taskPatchSchema.parse(parseJsonArg(rest[1], "task patch"));
        context.printJson(updateTask(rest[0], input));
        return;
      }

      throwUnknownCommand(positionalArgs);
    },
  },
];
