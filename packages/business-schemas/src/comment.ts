import { z } from "zod";

export const commentableTypeSchema = z.enum([
  "company_card",
  "contact",
  "document",
  "expense",
  "payroll",
  "deal",
  "sales_invoice",
  "project",
  "task",
]);

export const commentInputSchema = z
  .object({
    commentableType: commentableTypeSchema,
    commentableId: z.string().min(1).optional(),
    commentableSlug: z.string().min(1).optional(),
    body: z.string().min(1),
    authorName: z.string().min(1),
    authorContactId: z.string().min(1).optional(),
    authorContactSlug: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const targetLocatorCount = Number(Boolean(value.commentableId)) + Number(Boolean(value.commentableSlug));
    if (targetLocatorCount !== 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of commentableId or commentableSlug",
        path: ["commentableId"],
      });
    }

    const authorLocatorCount = Number(Boolean(value.authorContactId)) + Number(Boolean(value.authorContactSlug));
    if (authorLocatorCount > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at most one of authorContactId or authorContactSlug",
        path: ["authorContactId"],
      });
    }
  });

export const commentPatchSchema = z
  .object({
    body: z.string().min(1).optional(),
    authorName: z.string().min(1).optional(),
    authorContactId: z.union([z.string().min(1), z.null()]).optional(),
    authorContactSlug: z.union([z.string().min(1), z.null()]).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const authorLocatorCount =
      Number(value.authorContactId !== undefined) + Number(value.authorContactSlug !== undefined);
    if (authorLocatorCount > 1) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide at most one of authorContactId or authorContactSlug",
        path: ["authorContactId"],
      });
    }
  });

export type CommentableType = z.infer<typeof commentableTypeSchema>;
export type CommentInput = z.infer<typeof commentInputSchema>;
export type CommentPatch = z.infer<typeof commentPatchSchema>;
