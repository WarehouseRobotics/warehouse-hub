import { z } from "zod";
export declare const taskInputSchema: z.ZodObject<{
    projectId: z.ZodString;
    parentTaskId: z.ZodOptional<z.ZodString>;
    title: z.ZodString;
    description: z.ZodOptional<z.ZodString>;
    status: z.ZodDefault<z.ZodEnum<["open", "in_progress", "done", "cancelled"]>>;
    priority: z.ZodDefault<z.ZodEnum<["low", "medium", "high"]>>;
    dueDate: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    status: "cancelled" | "open" | "in_progress" | "done";
    title: string;
    projectId: string;
    priority: "low" | "medium" | "high";
    description?: string | undefined;
    dueDate?: string | undefined;
    parentTaskId?: string | undefined;
}, {
    title: string;
    projectId: string;
    status?: "cancelled" | "open" | "in_progress" | "done" | undefined;
    description?: string | undefined;
    dueDate?: string | undefined;
    parentTaskId?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
}>;
export declare const taskPatchSchema: z.ZodObject<{
    projectId: z.ZodOptional<z.ZodString>;
    parentTaskId: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    status: z.ZodOptional<z.ZodDefault<z.ZodEnum<["open", "in_progress", "done", "cancelled"]>>>;
    priority: z.ZodOptional<z.ZodDefault<z.ZodEnum<["low", "medium", "high"]>>>;
    dueDate: z.ZodOptional<z.ZodOptional<z.ZodString>>;
}, "strict", z.ZodTypeAny, {
    status?: "cancelled" | "open" | "in_progress" | "done" | undefined;
    description?: string | undefined;
    title?: string | undefined;
    dueDate?: string | undefined;
    projectId?: string | undefined;
    parentTaskId?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
}, {
    status?: "cancelled" | "open" | "in_progress" | "done" | undefined;
    description?: string | undefined;
    title?: string | undefined;
    dueDate?: string | undefined;
    projectId?: string | undefined;
    parentTaskId?: string | undefined;
    priority?: "low" | "medium" | "high" | undefined;
}>;
export type TaskInput = z.infer<typeof taskInputSchema>;
export type TaskPatch = z.infer<typeof taskPatchSchema>;
