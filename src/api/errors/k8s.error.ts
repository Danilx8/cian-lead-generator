export class K8sError extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, K8sError.prototype);
  }
}