export type ReviewErrorCode =
  | "missing-ev"
  | "unknown-buy"
  | "empty-options"
  | "duplicate-buy"
  | "invalid-option"
  | "invalid-round"
  | "invalid-reason"
  | "enemy-cash";

export class ReviewError extends Error {
  readonly code: ReviewErrorCode;

  constructor(code: ReviewErrorCode, message: string) {
    super(message);
    this.name = "ReviewError";
    this.code = code;
  }
}
