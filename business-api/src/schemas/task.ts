import { z } from "zod";

export const taskInputSchema = z
  .object({
    projectId: z.string().min(1),
    parentTaskId: z.string().optional(),
    title: z.string().min(1),
    description: z.string().optional(),
    status: z.enum(["open", "in_progress", "done", "cancelled"]).default("open"),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    dueDate: z.string().optional(),
  })
  .strict();

export const taskPatchSchema = taskInputSchema.partial();

export type TaskInput = z.infer<typeof taskInputSchema>;
export type TaskPatch = z.infer<typeof taskPatchSchema>;
