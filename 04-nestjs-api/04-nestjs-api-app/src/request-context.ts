import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export function requestContext(request: Request, response: Response, next: NextFunction): void { const incoming = request.header('x-request-id'); const id = incoming && /^[A-Za-z0-9._:-]{1,128}$/.test(incoming) ? incoming : randomUUID(); response.setHeader('x-request-id', id); (request as Request & { requestId?: string }).requestId = id; next(); }
