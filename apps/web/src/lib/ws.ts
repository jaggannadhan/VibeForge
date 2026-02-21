"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { AgentEvent, IterationNode, ServerWsMessage } from "@vibe-studio/shared";

const WS_URL = process.env.NEXT_PUBLIC_API_URL?.replace(/^http/, "ws") || "ws://localhost:3001/api";

// ── Tree helpers ─────────────────────────────────────────────────────

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

function applyEvent(
  tree: IterationNode | null,
  event: AgentEvent
): IterationNode {
  // If tree doesn't exist yet, create root from the first event
  if (!tree) {
    return {
      nodeId: event.nodeId,
      iterationIndex: 0,
      stepKey: event.payload.stepKey || "run",
      title: event.payload.title || event.nodeId,
      status: event.payload.status || "running",
      startedAt: event.ts,
      children: [],
    };
  }

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

// ── useTraceStream hook ──────────────────────────────────────────────

export interface TraceStreamState {
  tree: IterationNode | null;
  runStatus: "idle" | "running" | "success" | "error";
}

export function useTraceStream(
  projectId: string,
  runActive: boolean
): TraceStreamState {
  const [tree, setTree] = useState<IterationNode | null>(null);
  const [runStatus, setRunStatus] = useState<TraceStreamState["runStatus"]>("idle");
  const wsRef = useRef<WebSocket | null>(null);
  const treeRef = useRef<IterationNode | null>(null);

  // Reset tree when a new run starts
  const prevRunActive = useRef(false);
  useEffect(() => {
    if (runActive && !prevRunActive.current) {
      treeRef.current = null;
      setTree(null);
      setRunStatus("running");
    }
    prevRunActive.current = runActive;
  }, [runActive]);

  const handleMessage = useCallback((data: string) => {
    try {
      const msg = JSON.parse(data) as ServerWsMessage;

      switch (msg.type) {
        case "agentEvent": {
          const updated = applyEvent(treeRef.current, msg.event);
          treeRef.current = updated;
          setTree(updated);
          break;
        }
        case "runStarted":
          setRunStatus("running");
          break;
        case "runFinished":
          setRunStatus(msg.status === "success" ? "success" : "error");
          break;
        case "error":
          // Server error message (e.g. pong)
          break;
      }
    } catch {
      // Ignore unparseable messages
    }
  }, []);

  useEffect(() => {
    if (!runActive) {
      // Close existing connection when run is not active
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const url = `${WS_URL}/projects/${projectId}/ws`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      handleMessage(event.data);
    };

    ws.onerror = () => {
      setRunStatus("error");
    };

    ws.onclose = () => {
      wsRef.current = null;
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [projectId, runActive, handleMessage]);

  return { tree, runStatus };
}
