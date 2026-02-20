// packages/shared/src/schemas/manifest.zod.ts
import { z } from "zod";

export const BreakpointSchema = z.object({
  breakpointId: z.string().min(1).regex(/^[a-z0-9-]+$/),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  deviceScaleFactor: z.number().positive().default(1),
});

export const StateSchema = z.object({
  stateId: z.string().min(1).regex(/^[a-z0-9-]+$/),
});

export const TargetEntrySchema = z.object({
  type: z.literal("route"),
  fileHint: z.string().min(1),
});

export const TargetSchema = z.object({
  targetId: z.string().min(1).regex(/^[a-z0-9-]+$/),
  route: z.string().min(1).startsWith("/"),
  entry: TargetEntrySchema,
});

export const RunDefaultsSchema = z.object({
  targetId: z.string().min(1).regex(/^[a-z0-9-]+$/),
  threshold: z.number().min(0).max(1).default(0.92),
  maxIterations: z.number().int().min(1).max(50).default(10),
});

export const ManifestSchema = z
  .object({
    schemaVersion: z.literal("1.0"),
    projectName: z.string().min(1),
    targets: z.array(TargetSchema).min(1),
    breakpoints: z.array(BreakpointSchema).min(1),
    states: z.array(StateSchema).min(1),
    runDefaults: RunDefaultsSchema,
  })
  .superRefine((m, ctx) => {
    // Ensure runDefaults.targetId exists in targets
    if (!m.targets.some((t) => t.targetId === m.runDefaults.targetId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["runDefaults", "targetId"],
        message: "runDefaults.targetId must match a targetId in targets[]",
      });
    }
  });

export type Manifest = z.infer<typeof ManifestSchema>;
export type Breakpoint = z.infer<typeof BreakpointSchema>;
export type State = z.infer<typeof StateSchema>;
export type Target = z.infer<typeof TargetSchema>;
export type TargetEntry = z.infer<typeof TargetEntrySchema>;
export type RunDefaults = z.infer<typeof RunDefaultsSchema>;
