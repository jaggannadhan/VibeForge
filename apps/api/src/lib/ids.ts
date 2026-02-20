import { nanoid } from "nanoid";

export function newProjectId(): string {
  return `proj_${nanoid(12)}`;
}

export function newPackId(): string {
  return `pack_${nanoid(12)}`;
}
