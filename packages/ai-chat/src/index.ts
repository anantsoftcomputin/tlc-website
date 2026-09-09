export type GroundedToolResult<T> = {
  result: T;
  source: string;
  fetchedAt: string;
  reasoning: string;
};
export * from "./context";
export * from "./grounding";
export * from "./preferences";
