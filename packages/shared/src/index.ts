// packages/shared/src/index.ts — barrel export

// Zod schemas
export {
  ManifestSchema,
  BreakpointSchema,
  StateSchema,
  TargetSchema,
  TargetEntrySchema,
  RunDefaultsSchema,
} from "./schemas/manifest.zod";

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
} from "./schemas/designIr.zod";

// Types — events
export type {
  ArtifactKind,
  ArtifactLink,
  TraceStatus,
  IterationNode,
  AgentEvent,
} from "./contracts/events";

// Types — design pack
export type {
  Manifest,
  Breakpoint,
  State,
  Target,
  TargetEntry,
  RunDefaults,
  DesignIr,
  TargetIr,
  IRNode,
  ComponentMapping,
  LayoutTargets,
  StyleTargets,
  A11yTargets,
  BBox,
  Tolerance,
} from "./contracts/designPack";

// Types — API
export type {
  FileTreeNode,
  CreateProjectResponse,
  GetProjectResponse,
  UploadDesignPackResponse,
  GetDesignPackResponse,
  GetFileTreeResponse,
  GetFileContentResponse,
  StartPreviewResponse,
  StartRunRequest,
  StartRunResponse,
  GetRunReportResponse,
} from "./contracts/api";
