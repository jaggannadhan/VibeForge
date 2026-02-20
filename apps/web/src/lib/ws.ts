"use client";

import type { AgentEvent, IterationNode } from "@vibe-studio/shared";
import { MOCK_TRACE_TREE, createMockEventStream } from "./mock-data";

type TraceUpdateHandler = (tree: IterationNode) => void;

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function findNode(
  tree: IterationNode,
  nodeId: string
): IterationNode | undefined {
  if (tree.nodeId === nodeId) return tree;
  if (tree.children) {
    for (const child of tree.children) {
      const found = findNode(child, nodeId);
      if (found) return found;
    }
  }
  return undefined;
}

function applyEvent(tree: IterationNode, event: AgentEvent): IterationNode {
  const updated = deepClone(tree);
  const node = findNode(updated, event.nodeId);

  if (!node) {
    // Node doesn't exist yet — add as child based on event
    if (event.type === "nodeCreated" || event.type === "nodeStarted") {
      const parentId = event.nodeId.includes("-")
        ? event.nodeId.substring(0, event.nodeId.lastIndexOf("-"))
        : "root";
      const parent = findNode(updated, parentId);
      if (parent) {
        if (!parent.children) parent.children = [];
        parent.children.push({
          nodeId: event.nodeId,
          parentNodeId: parentId,
          iterationIndex: parent.iterationIndex,
          stepKey: event.payload.stepKey || "unknown",
          title: event.payload.title || event.nodeId,
          status: event.payload.status || "running",
          startedAt: event.ts,
        });
      }
    }
    return updated;
  }

  switch (event.type) {
    case "nodeStarted":
      node.status = "running";
      node.startedAt = event.ts;
      if (event.payload.title) node.title = event.payload.title;
      break;
    case "nodeProgress":
      node.message = event.payload.message;
      break;
    case "nodeFinished":
      node.status = event.payload.status || "success";
      node.finishedAt = event.ts;
      if (event.payload.message) node.message = event.payload.message;
      if (event.payload.score) node.score = event.payload.score;
      break;
    case "nodeFailed":
      node.status = "error";
      node.finishedAt = event.ts;
      if (event.payload.message) node.message = event.payload.message;
      break;
    case "artifactAdded":
      if (event.payload.artifact) {
        if (!node.artifacts) node.artifacts = [];
        node.artifacts.push(event.payload.artifact);
      }
      break;
  }

  return updated;
}

export class MockTraceStream {
  private handlers: Set<TraceUpdateHandler> = new Set();
  private tree: IterationNode;
  private timers: ReturnType<typeof setTimeout>[] = [];
  private running = false;

  constructor() {
    this.tree = deepClone(MOCK_TRACE_TREE);
  }

  subscribe(handler: TraceUpdateHandler): () => void {
    this.handlers.add(handler);
    // Immediately emit current state
    handler(deepClone(this.tree));
    return () => {
      this.handlers.delete(handler);
    };
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    const events = createMockEventStream();
    const baseTime = Date.now();

    events.forEach((event, index) => {
      const eventTime = new Date(event.ts).getTime();
      const delayMs = Math.max(0, eventTime - baseTime);

      const timer = setTimeout(() => {
        this.tree = applyEvent(this.tree, event);
        this.handlers.forEach((handler) => handler(deepClone(this.tree)));
      }, delayMs);

      this.timers.push(timer);
    });
  }

  stop(): void {
    this.running = false;
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }

  getTree(): IterationNode {
    return deepClone(this.tree);
  }
}

// Singleton for the demo
let instance: MockTraceStream | null = null;

export function getMockTraceStream(): MockTraceStream {
  if (!instance) {
    instance = new MockTraceStream();
  }
  return instance;
}
