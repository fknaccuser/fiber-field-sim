export class AmbiguousPathError extends Error {
  readonly code = 'AMBIGUOUS_PATH';
  readonly nodeId: string;
  constructor(nodeId: string) {
    super(`Node ${nodeId} has more than one possible continuation and no splice map entry resolves it`);
    this.name = 'AmbiguousPathError';
    this.nodeId = nodeId;
  }
}

export class StrandRequiredError extends Error {
  readonly code = 'STRAND_REQUIRED';
  readonly spanId: string;
  constructor(spanId: string) {
    super(`Fiber span ${spanId} has strands; a strand (tubeColor/fiberColor) is required but was not provided`);
    this.name = 'StrandRequiredError';
    this.spanId = spanId;
  }
}
