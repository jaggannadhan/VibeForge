// packages/shared/src/schemas/designIr.zod.ts
import { z } from "zod";

const RgbString = z.string().regex(/^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/);

export const BBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number().positive(),
  h: z.number().positive(),
});

export const ToleranceSchema = z.object({
  x: z.number().nonnegative().default(8),
  y: z.number().nonnegative().default(8),
  w: z.number().nonnegative().default(10),
  h: z.number().nonnegative().default(10),
});

export const LayoutTargetsSchema = z.object({
  bbox: BBoxSchema.optional(),
  tolerancePx: ToleranceSchema.optional(),
});

export const StyleTargetsSchema = z.object({
  fontFamily: z.string().optional(),
  fontSizePx: z.number().positive().optional(),
  fontWeight: z.number().int().optional(),
  lineHeightPx: z.number().positive().optional(),
  color: RgbString.optional(),
  backgroundColor: RgbString.optional(),
  borderRadiusPx: z.number().nonnegative().optional(),
  boxShadow: z.string().optional(),
});

export const A11yTargetsSchema = z.object({
  role: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  labelledByNodeId: z.string().min(1).optional(),
});

export const ComponentMappingSchema = z.object({
  component: z.string().min(1),
  props: z.record(z.any()).default({}),
});

export const IRNodeSchema = z.object({
  nodeId: z.string().min(1).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  matchImportance: z.enum(["critical", "normal", "low"]).default("normal"),
  componentMapping: ComponentMappingSchema.optional(),
  layoutTargets: LayoutTargetsSchema.default({}),
  styleTargets: StyleTargetsSchema.default({}),
  a11yTargets: A11yTargetsSchema.default({}),
});

export const TargetIrSchema = z.object({
  targetId: z.string().min(1).regex(/^[a-z0-9-]+$/),
  nodes: z.array(IRNodeSchema).min(1),
});

export const DesignIrSchema = z.object({
  schemaVersion: z.literal("1.0"),
  targets: z.array(TargetIrSchema).min(1),
});

export type DesignIr = z.infer<typeof DesignIrSchema>;
export type TargetIr = z.infer<typeof TargetIrSchema>;
export type IRNode = z.infer<typeof IRNodeSchema>;
export type ComponentMapping = z.infer<typeof ComponentMappingSchema>;
export type LayoutTargets = z.infer<typeof LayoutTargetsSchema>;
export type StyleTargets = z.infer<typeof StyleTargetsSchema>;
export type A11yTargets = z.infer<typeof A11yTargetsSchema>;
export type BBox = z.infer<typeof BBoxSchema>;
export type Tolerance = z.infer<typeof ToleranceSchema>;
