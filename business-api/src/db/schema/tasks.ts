import { sql } from "drizzle-orm";
import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { projects } from "./projects.js";

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id),
    parentTaskId: text("parent_task_id").references(() => tasks.id),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("open"),
    priority: text("priority").notNull().default("medium"),
    dueDate: text("due_date"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    deletedAt: text("deleted_at"),
  },
  (table) => ({
    projectIdx: index("tasks_project_id_idx").on(table.projectId),
    parentTaskIdx: index("tasks_parent_task_id_idx").on(table.parentTaskId),
  }),
);
