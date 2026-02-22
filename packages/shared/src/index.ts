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
  IterationDecision,
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

// Types — WebSocket
export type {
  ServerWsMessage,
  ClientWsMessage,
} from "./contracts/ws";

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
  IterationSummary,
  GetIterationsResponse,
  StartHistoricalPreviewResponse,
  GetLatestPreviewResponse,
  GetRunStateResponse,
  RevertToBestResponse,
  GetIterationDecisionResponse,
} from "./contracts/api";
