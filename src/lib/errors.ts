export class AppError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const notFound = (what: string) => new AppError(404, `${what} no encontrado`);
export const forbidden = () => new AppError(403, "No tienes permiso para realizar esta acción");
export const unauthorized = () => new AppError(401, "No autorizado");
