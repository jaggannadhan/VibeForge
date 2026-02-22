// packages/shared/src/contracts/events.ts

export type ArtifactKind =
  | "designPack"
  | "baselineImage"
  | "designIr"
  | "workspaceFile"
  | "snapshotJson"
  | "snapshotImage"
  | "scoreReportJson"
  | "scoreReportHtml"
  | "overflowReport"
  | "diffPatch"
  | "log"
  | "previewUrl";

export interface ArtifactLink {
  id: string;
  kind: ArtifactKind;
  label: string;
  href: string;
  mime?: string;
  sizeBytes?: number;
}

export type TraceStatus = "queued" | "running" | "success" | "error" | "skipped";

export interface IterationDecision {
  accepted: boolean;
  reason: string;
}

export interface IterationNode {
  nodeId: string;
  parentNodeId?: string;
  iterationIndex: number;
  stepKey: string;
  title: string;
  status: TraceStatus;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
  score?: {
    overall?: number;
    layout?: number;
    style?: number;
    a11y?: number;
    perceptual?: number;
    deltaFromPrev?: number;
  };
  decision?: IterationDecision;
  isBest?: boolean;
  focusArea?: string;
  artifacts?: ArtifactLink[];
  children?: IterationNode[];
}

export interface AgentEvent {
  eventId: string;
  projectId: string;
  packId?: string;
  nodeId: string;
  type:
    | "nodeCreated"
    | "nodeStarted"
    | "nodeProgress"
    | "nodeFinished"
    | "nodeFailed"
    | "artifactAdded";
  ts: string;
  payload: {
    stepKey?: string;
    title?: string;
    status?: TraceStatus;
    message?: string;
    progressPct?: number;
    score?: IterationNode["score"];
    decision?: IterationDecision;
    isBest?: boolean;
    focusArea?: string;
    artifact?: ArtifactLink;
  };
}
