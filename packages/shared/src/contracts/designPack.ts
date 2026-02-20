// packages/shared/src/contracts/designPack.ts

export type {
  Manifest,
  Breakpoint,
  State,
  Target,
  TargetEntry,
  RunDefaults,
} from "../schemas/manifest.zod";

export type {
  DesignIr,
  TargetIr,
  IRNode,
  ComponentMapping,
  LayoutTargets,
  StyleTargets,
  A11yTargets,
  BBox,
  Tolerance,
} from "../schemas/designIr.zod";

export {
  ManifestSchema,
  BreakpointSchema,
  StateSchema,
  TargetSchema,
  TargetEntrySchema,
  RunDefaultsSchema,
} from "../schemas/manifest.zod";

export {
  DesignIrSchema,
  TargetIrSchema,
  IRNodeSchema,
  ComponentMappingSchema,
  LayoutTargetsSchema,
  StyleTargetsSchema,
  A11yTargetsSchema,
  BBoxSchema,
  ToleranceSchema,
} from "../schemas/designIr.zod";
