// Only application-authored messages enter this error. Never wrap raw provider errors.
export class MaterialInputError extends Error {
  constructor(message: string) { super(message); this.name = 'MaterialInputError'; }
}
