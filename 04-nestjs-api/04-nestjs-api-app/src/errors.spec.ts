import { ApiExceptionFilter } from './errors';
import { BadRequestException, NotFoundException } from '@nestjs/common';

function host(response: any): any { return { switchToHttp: () => ({ getResponse: () => response, getRequest: () => ({ requestId: 'req-1', headers: { 'x-trace-id': 'trace-1' } }) }) }; }
test('maps validation exceptions to approved envelope', () => { const response = { status: jest.fn().mockReturnThis(), json: jest.fn() }; new ApiExceptionFilter().catch(new BadRequestException('bad'), host(response)); const body = response.json.mock.calls[0][0]; expect(response.status).toHaveBeenCalledWith(400); expect(body.error.code).toBe('VALIDATION_ERROR'); expect(body).toMatchObject({ success: false, data: null, request_id: 'req-1', trace_id: 'trace-1', schema_version: 1 }); });
test('maps not found exceptions to approved envelope', () => { const response = { status: jest.fn().mockReturnThis(), json: jest.fn() }; new ApiExceptionFilter().catch(new NotFoundException('missing'), host(response)); expect(response.json.mock.calls[0][0].error.code).toBe('NOT_FOUND'); });
