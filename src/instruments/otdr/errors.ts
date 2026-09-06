export { AmbiguousPathError, StrandRequiredError } from '../shared/errors';
export { MissingSplitRatioError } from '../../world';

export class OtdrSettingsError extends Error {
  readonly code = 'OTDR_SETTINGS_ERROR';
  readonly field: string;
  constructor(field: string, message: string) {
    super(`OTDR setting "${field}": ${message}`);
    this.name = 'OtdrSettingsError';
    this.field = field;
  }
}

export class BidirectionalMismatchError extends Error {
  readonly code = 'BIDIRECTIONAL_MISMATCH';
  constructor(message: string) {
    super(message);
    this.name = 'BidirectionalMismatchError';
  }
}
