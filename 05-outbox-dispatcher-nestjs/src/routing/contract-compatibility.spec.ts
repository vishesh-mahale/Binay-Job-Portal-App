import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildTaskPayload } from './payload.builder';
import { EventRouteRegistry } from './event-route.registry';

describe('shared task contract compatibility', () => {
  it('security scan producer envelope is reduced to the worker task contract', () => {
    const contractPath = resolve(
      __dirname,
      '../../../contracts/tasks/security-scan-task.v1.json',
    );
    const contract = JSON.parse(readFileSync(contractPath, 'utf8')) as {
      required: string[];
      additionalProperties: boolean;
      properties: Record<string, { const?: number }>;
    };

    const route = new EventRouteRegistry().resolve('security.scan.requested');
    expect(route?.taskContract).toBe(
      'contracts/tasks/security-scan-task.v1.json',
    );
    expect(contract.required).toEqual([
      'schema_version',
      'event_id',
      'aggregate_id',
      'trace_id',
    ]);
    expect(contract.additionalProperties).toBe(false);
    expect(contract.properties.schema_version.const).toBe(1);

    const payload = buildTaskPayload({
      id: '11111111-1111-4111-8111-111111111111',
      event_type: 'security.scan.requested',
      aggregate_id: '22222222-2222-4222-8222-222222222222',
      correlation_id: '33333333-3333-4333-8333-333333333333',
      aggregate_type: 'uploaded_document',
      schema_version: 1,
      payload: { storage_url: 'must-not-cross-service-boundary' },
    } as never);

    expect(Object.keys(payload).sort()).toEqual([
      'aggregate_id',
      'event_id',
      'schema_version',
      'trace_id',
    ]);
    expect(payload).not.toHaveProperty('storage_url');
  });
});
