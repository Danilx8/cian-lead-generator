export class ApiError extends Error {
  status: number;
  code?: string;
  userMessage?: string;
  details?: any;

  constructor(status: number, message: string, code?: string, userMessage?: string, details?: any) {
    super(message);
    this.status = status;
    this.code = code;
    this.userMessage = userMessage || message;
    this.details = details;
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}
