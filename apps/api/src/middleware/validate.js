/**
 * Generic validate middleware factory.
 * validate(schema) returns middleware that calls schema.parse(req.body)
 * and calls next() or passes ZodError to next(err).
 */
export function validate(schema) {
  return (req, _res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
}
