import {
  EMPLOYMENT_TYPES,
  ResumeService,
  clampText,
  normalizeLinkUrl,
  textOrNull,
  toDecimal41,
  toEnumValue,
  toJsonArray,
  toIsoDate,
  toSmallInt,
} from './resume';

describe('ResumeService confirmation guards', () => {
  it('rejects malformed confirmation input before opening a transaction', async () => {
    const transaction = jest.fn();
    const service = new ResumeService({ transaction } as any, {} as any);
    await expect(service.confirm({ user: { sub: 'u' } } as any, 'bad-id', {} as any)).rejects.toThrow('VALIDATION_ERROR');
    expect(transaction).not.toHaveBeenCalled();
  });

  it('rejects a stale profile revision before canonical writes', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'doc', security_scan_status: 'clean', candidate_id: 'candidate', profile_revision: 4 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'parsed' }] });
    const transaction = jest.fn(async (work: any) => work({ query }));
    const service = new ResumeService({ transaction } as any, {} as any);
    await expect(service.confirm({ user: { sub: 'u' } } as any, '00000000-0000-4000-8000-000000000001', { expected_profile_revision: 3, profile: { summary: 'x' } })).rejects.toThrow('STALE_REVISION');
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('reuses an existing document by checksum without writing storage or outbox', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ document_id: 'existing-document' }] });
    const storage = { put: jest.fn(), remove: jest.fn() };
    const service = new ResumeService({ query, transaction: jest.fn() } as any, storage as any);
    const previousLimit = process.env.RESUME_MAX_BYTES;
    const previousBucket = process.env.RESUME_STORAGE_BUCKET;
    process.env.RESUME_MAX_BYTES = '1024';
    process.env.RESUME_STORAGE_BUCKET = 'private-documents';
    try {
      await expect(service.upload({ user: { sub: 'user-1' } } as any, {
        originalname: 'resume.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7'),
      }, true)).resolves.toEqual({ document_id: 'existing-document', reused: true });
      expect(storage.put).not.toHaveBeenCalled();
      expect(storage.remove).not.toHaveBeenCalled();
    } finally {
      process.env.RESUME_MAX_BYTES = previousLimit;
      process.env.RESUME_STORAGE_BUCKET = previousBucket;
    }
  });

  it('cleans the private object when the atomic metadata transaction fails', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'candidate-1' }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });
    const storage = { put: jest.fn().mockResolvedValue(undefined), remove: jest.fn().mockResolvedValue(undefined) };
    const service = new ResumeService({ query, transaction: jest.fn().mockRejectedValue(new Error('DB_FAILURE')) } as any, storage as any);
    const previousLimit = process.env.RESUME_MAX_BYTES;
    const previousBucket = process.env.RESUME_STORAGE_BUCKET;
    process.env.RESUME_MAX_BYTES = '1024';
    process.env.RESUME_STORAGE_BUCKET = 'private-documents';
    try {
      await expect(service.upload({ user: { sub: 'user-1' } } as any, {
        originalname: 'resume.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7'),
      }, false)).rejects.toThrow('DB_FAILURE');
      expect(storage.put).toHaveBeenCalledTimes(1);
      expect(storage.remove).toHaveBeenCalledTimes(1);
      expect(storage.remove.mock.calls[0][0]).toBe('private-documents');
    } finally {
      process.env.RESUME_MAX_BYTES = previousLimit;
      process.env.RESUME_STORAGE_BUCKET = previousBucket;
    }
  });

  it('creates the approved security-scan outbox event without embedding file content', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'candidate-1' }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] });
    const clientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'document-1', security_scan_status: 'pending', processing_status: 'uploaded' }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ version: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const storage = { put: jest.fn().mockResolvedValue(undefined), remove: jest.fn() };
    const transaction = jest.fn(async (work: any) => work({ query: clientQuery }));
    const service = new ResumeService({ query, transaction } as any, storage as any);
    const previousLimit = process.env.RESUME_MAX_BYTES;
    const previousBucket = process.env.RESUME_STORAGE_BUCKET;
    process.env.RESUME_MAX_BYTES = '1024';
    process.env.RESUME_STORAGE_BUCKET = 'private-documents';
    try {
      await expect(service.upload({ user: { sub: 'user-1' } } as any, {
        originalname: 'resume.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7'),
      }, false)).resolves.toEqual(expect.objectContaining({ document_id: 'document-1', stage: 'UPLOADED', reused: false }));
      const eventCall = clientQuery.mock.calls[4];
      expect(eventCall[0]).toContain("'security.scan.requested'");
      expect(eventCall[1][1]).toMatch(/^[0-9a-f-]{36}$/i);
      const serializedPayload = String(eventCall[1][2]);
      expect(serializedPayload).toContain('security.scan.requested');
      expect(serializedPayload).not.toContain('%PDF-1.7');
      expect(serializedPayload).not.toContain('private-documents');
    } finally {
      process.env.RESUME_MAX_BYTES = previousLimit;
      process.env.RESUME_STORAGE_BUCKET = previousBucket;
    }
  });

  it.each([
    [false, false],
    [true, true],
  ])('keeps an existing active resume unless explicitly selected (%s)', async (useAsActive, shouldUnlinkCurrent) => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'candidate-1' }] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] });
    const clientQuery = jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'document-2', security_scan_status: 'pending', processing_status: 'uploaded' }] });
    if (shouldUnlinkCurrent) clientQuery.mockResolvedValueOnce({ rows: [] });
    clientQuery
      .mockResolvedValueOnce({ rows: [{ version: 2 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const storage = { put: jest.fn().mockResolvedValue(undefined), remove: jest.fn() };
    const service = new ResumeService({ query, transaction: jest.fn(async (work: any) => work({ query: clientQuery })) } as any, storage as any);
    const previousLimit = process.env.RESUME_MAX_BYTES;
    const previousBucket = process.env.RESUME_STORAGE_BUCKET;
    process.env.RESUME_MAX_BYTES = '1024';
    process.env.RESUME_STORAGE_BUCKET = 'private-documents';
    try {
      await expect(service.upload({ user: { sub: 'user-1' } } as any, {
        originalname: 'resume.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7'),
      }, useAsActive)).resolves.toEqual(expect.objectContaining({ document_id: 'document-2', reused: false }));
      const unlinkCalls = clientQuery.mock.calls.filter(([sql]) => String(sql).includes('SET is_current = FALSE'));
      expect(unlinkCalls).toHaveLength(shouldUnlinkCurrent ? 1 : 0);
    } finally {
      process.env.RESUME_MAX_BYTES = previousLimit;
      process.env.RESUME_STORAGE_BUCKET = previousBucket;
    }
  });

  it.each([
    ['pending', 'SCAN_PENDING'],
    ['scanning', 'SCAN_PENDING'],
    ['infected', 'INFECTED_FILE'],
    ['quarantined', 'INFECTED_FILE'],
    ['failed', 'SCAN_FAILED'],
  ])('blocks confirmation for security state %s', async (security_scan_status, code) => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{
        id: 'doc', security_scan_status, candidate_id: 'candidate', profile_revision: 1,
      }] })
      .mockResolvedValueOnce({ rows: [] });
    const transaction = jest.fn(async (work: any) => work({ query }));
    const service = new ResumeService({ transaction } as any, {} as any);
    await expect(service.confirm(
      { user: { sub: 'user-1' } } as any,
      '00000000-0000-4000-8000-000000000001',
      { expected_profile_revision: 1, profile: { summary: 'safe' } },
    )).rejects.toThrow(code);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('blocks confirmation until a completed or partial parse result exists', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'doc', security_scan_status: 'clean', candidate_id: 'candidate', profile_revision: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    const transaction = jest.fn(async (work: any) => work({ query }));
    const service = new ResumeService({ transaction } as any, {} as any);
    await expect(service.confirm(
      { user: { sub: 'user-1' } } as any,
      '00000000-0000-4000-8000-000000000001',
      { expected_profile_revision: 1, profile: { summary: 'safe' } },
    )).rejects.toThrow('PARSING_NOT_READY');
  });

  it('throws NO_CONFIRMATION_DATA when first confirm has all-null profile fields and no facts', async () => {
    const query = jest.fn()
      .mockResolvedValueOnce({ rows: [{ id: 'doc', security_scan_status: 'clean', candidate_id: 'candidate', profile_revision: 1 }] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'parsed', profile_completed_at: null }] });
    const transaction = jest.fn(async (work: any) => work({ query }));
    const service = new ResumeService({ transaction } as any, {} as any);
    await expect(service.confirm(
      { user: { sub: 'user-1' } } as any,
      '00000000-0000-4000-8000-000000000001',
      { expected_profile_revision: 1, profile: { summary: null }, facts: {} },
    )).rejects.toThrow('NO_CONFIRMATION_DATA');
  });
});

describe('resume confirmation value coercion', () => {
  it.each([
    ['2021-05-01', '2021-05-01'],
    ['2020-02-29', '2020-02-29'],
    ['  2021-05-01  ', '2021-05-01'],
    ['2021-02-29', null],
    ['2021-02-31', null],
    ['2021-13-01', null],
    ['2021-00-10', null],
    ['2021-01-00', null],
    ['Jan 2020', null],
    ['2020 - 2023', null],
    ['1.5.2021', null],
    ['05/06/2021', null],
    ['', null],
  ])('toIsoDate(%p) only accepts a real calendar DATE', (input, expected) => {
    expect(toIsoDate(input)).toBe(expected);
  });

  it('toIsoDate rejects non-string values instead of coercing them to epoch dates', () => {
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate(undefined)).toBeNull();
    expect(toIsoDate(20210501)).toBeNull();
    expect(toIsoDate(new Date('2021-05-01'))).toBeNull();
  });

  it.each([
    ['linkedin.com/in/foo', 'https://linkedin.com/in/foo'],
    ['https://github.com/foo', 'https://github.com/foo'],
    ['HTTP://Example.COM/Path?x=1#h', 'http://example.com/Path?x=1#h'],
    ['mailto:a@b.com', null],
    ['ftp://x.com/a', null],
    ['tel:+911234567890', null],
    ['not a url', null],
    ['//cdn.x.com/a', null],
    ['', null],
    ['   ', null],
  ])('normalizeLinkUrl(%p) satisfies CHECK (url ~* \'^https?://\')', (input, expected) => {
    expect(normalizeLinkUrl(input)).toBe(expected);
  });

  it('normalizeLinkUrl rejects non-string values', () => {
    expect(normalizeLinkUrl(null)).toBeNull();
    expect(normalizeLinkUrl({ url: 'x.com' })).toBeNull();
  });

  it.each([
    ['full_time', 'full_time'],
    ['  contract  ', 'contract'],
    ['Full Time', null],
    ['full-time', null],
    ['FULL_TIME', null],
    ['', null],
  ])('toEnumValue(%p) only accepts a literal profile enum member', (input, expected) => {
    expect(toEnumValue(input, EMPLOYMENT_TYPES)).toBe(expected);
  });

  it('toEnumValue rejects non-string values rather than stringifying them', () => {
    expect(toEnumValue(null, EMPLOYMENT_TYPES)).toBeNull();
    expect(toEnumValue(7, EMPLOYMENT_TYPES)).toBeNull();
  });

  it('EMPLOYMENT_TYPES mirrors the SQL employment_type enum exactly', () => {
    expect([...EMPLOYMENT_TYPES].sort()).toEqual(
      ['contract', 'freelance', 'full_time', 'internship', 'part_time', 'temporary', 'volunteer'],
    );
  });

  it.each([
    [7, 7],
    ['7', 7],
    [' 8 ', 8],
    [7.4, 7],
    [15, 10],
    [0, 1],
    [-3, 1],
    ['Expert', null],
    ['', null],
    ['   ', null],
    [null, null],
    [undefined, null],
    [NaN, null],
    [Infinity, null],
  ])('toSmallInt(%p) honours SMALLINT CHECK BETWEEN 1 AND 10 and treats blank as unknown', (input, expected) => {
    expect(toSmallInt(input, 1, 10)).toBe(expected);
  });

  it.each([
    [3.14, 3.1],
    ['2.5', 2.5],
    [0, 0],
    [1000, 999.9],
    [999.94, 999.9],
    [-1, null],
    ['Expert', null],
    ['', null],
    [null, null],
    [undefined, null],
  ])('toDecimal41(%p) honours DECIMAL(4,1) CHECK >= 0 and treats blank as unknown', (input, expected) => {
    expect(toDecimal41(input)).toBe(expected);
  });

  it('clampText truncates to the declared VARCHAR width and treats blank as null', () => {
    expect(clampText('a'.repeat(60), 50)).toBe('a'.repeat(50));
    expect(clampText('a'.repeat(50), 50)).toBe('a'.repeat(50));
    expect(clampText('  React  ', 150)).toBe('React');
    expect(clampText('   ', 150)).toBeNull();
    expect(clampText('', 150)).toBeNull();
    expect(clampText(42, 150)).toBeNull();
    expect(clampText(null, 150)).toBeNull();
  });

  it('textOrNull passes unbounded TEXT columns through without truncation', () => {
    const long = 'x'.repeat(5000);
    expect(textOrNull(long)).toBe(long);
    expect(textOrNull('  built a thing  ')).toBe('built a thing');
    expect(textOrNull('   ')).toBeNull();
    expect(textOrNull(['not', 'text'])).toBeNull();
  });

  it('toJsonArray satisfies CHECK (jsonb_typeof(...) = \'array\')', () => {
    expect(toJsonArray([{ a: 1 }])).toBe('[{"a":1}]');
    expect(toJsonArray([])).toBe('[]');
    expect(toJsonArray('React, Node')).toBe('[]');
    expect(toJsonArray({ a: 1 })).toBe('[]');
    expect(toJsonArray(null)).toBe('[]');
    expect(toJsonArray(undefined)).toBe('[]');
  });
});

describe('insertConfirmedFacts skip accounting', () => {
  const buildClient = (options: { catalogSkillId?: string } = {}) => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: jest.fn(async (sql: string, params: unknown[]) => {
        calls.push({ sql: String(sql), params: params ?? [] });
        if (String(sql).startsWith('SELECT id FROM public.skills')) {
          return { rows: options.catalogSkillId ? [{ id: options.catalogSkillId }] : [] };
        }
        return { rows: [{ id: 'inserted-row' }] };
      }),
    };
    const insertsInto = (table: string) => calls.filter((call) => call.sql.includes(`INSERT INTO public.${table} `));
    return { client, calls, insertsInto };
  };

  const service = () => new ResumeService({ transaction: jest.fn() } as any, {} as any);

  it('skips experiences whose dates Postgres would reject and counts them per section', async () => {
    const { client, insertsInto } = buildClient();
    const skipped = await (service() as any).insertConfirmedFacts(client, 'candidate-1', 'doc-1', 'parsed-1', {
      experiences: [
        { company_name: 'Acme', job_title: 'Engineer', start_date: '2020 - 2023' },
        { company_name: 'Acme', job_title: 'Engineer', start_date: '2021-05-01', end_date: '2020-01-01' },
        { company_name: 'Acme', job_title: 'Engineer', start_date: '2021-05-01' },
      ],
    });
    expect(skipped).toEqual({ experiences: 2 });
    const inserts = insertsInto('candidate_experiences');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].params[5]).toBe('2021-05-01');
    expect(inserts[0].params[6]).toBeNull();
    expect(inserts[0].params[7]).toBe(true);
  });

  it('nulls an out-of-vocabulary employment_type instead of raising 22P02', async () => {
    const { client, insertsInto } = buildClient();
    await (service() as any).insertConfirmedFacts(client, 'candidate-1', 'doc-1', 'parsed-1', {
      experiences: [{ company_name: 'Acme', job_title: 'Engineer', start_date: '2021-05-01', employment_type: 'Full Time' }],
    });
    expect(insertsInto('candidate_experiences')[0].params[3]).toBeNull();
  });

  it('skips experiences missing a NOT NULL column and keeps rows with a valid one', async () => {
    const { client, insertsInto } = buildClient();
    const skipped = await (service() as any).insertConfirmedFacts(client, 'candidate-1', 'doc-1', 'parsed-1', {
      experiences: [
        { company_name: '   ', job_title: 'Engineer', start_date: '2021-05-01' },
        { company_name: 'Acme', job_title: 'Engineer' },
        { company_name: 'Acme', job_title: 'Engineer', start_date: '2021-05-01' },
      ],
    });
    expect(skipped).toEqual({ experiences: 2 });
    expect(insertsInto('candidate_experiences')).toHaveLength(1);
  });

  it('skips educations, certifications and projects that violate their date-ordering CHECKs', async () => {
    const { client, insertsInto } = buildClient();
    const skipped = await (service() as any).insertConfirmedFacts(client, 'candidate-1', 'doc-1', 'parsed-1', {
      educations: [
        { institution_name: 'DU', degree: 'BSc', start_date: '2018-07-01', end_date: '2015-07-01' },
        { institution_name: 'DU', degree: 'BSc', start_date: '2015-07-01', end_date: '2018-07-01' },
      ],
      certifications: [
        { name: 'AWS', issued_at: '2022-01-01', expires_at: '2021-01-01' },
        { name: 'AWS', issued_at: '2021-01-01', expires_at: '2022-01-01' },
      ],
      projects: [
        { title: 'Portal', started_at: '2022-06-01', completed_at: '2022-01-01' },
        { title: 'Portal', started_at: '2022-01-01', completed_at: '2022-06-01' },
      ],
    });
    expect(skipped).toEqual({ educations: 1, certifications: 1, projects: 1 });
    expect(insertsInto('candidate_educations')).toHaveLength(1);
    expect(insertsInto('candidate_certifications')).toHaveLength(1);
    expect(insertsInto('candidate_projects')).toHaveLength(1);
  });

  it('clamps grade to VARCHAR(100) and leaves description unbounded TEXT', async () => {
    const { client, insertsInto } = buildClient();
    const longGrade = 'g'.repeat(140);
    const longDescription = 'd'.repeat(4000);
    await (service() as any).insertConfirmedFacts(client, 'candidate-1', 'doc-1', 'parsed-1', {
      educations: [{ institution_name: 'DU', degree: 'BSc', grade: longGrade, description: longDescription }],
    });
    const params = insertsInto('candidate_educations')[0].params;
    expect(params[7]).toBe('g'.repeat(100));
    expect(params[8]).toBe(longDescription);
  });

  it('skips links whose url fails CHECK (url ~* \'^https?://\') and defaults link_type', async () => {
    const { client, insertsInto } = buildClient();
    const skipped = await (service() as any).insertConfirmedFacts(client, 'candidate-1', 'doc-1', 'parsed-1', {
      links: [
        { url: 'mailto:a@b.com', link_type: 'email' },
        { url: 'not a url' },
        { url: '' },
        { url: 'github.com/foo' },
        { url: 'linkedin.com/in/foo', link_type: 'l'.repeat(80), label: 'x'.repeat(150) },
      ],
    });
    expect(skipped).toEqual({ links: 3 });
    const inserts = insertsInto('candidate_links');
    expect(inserts).toHaveLength(2);
    expect(inserts[0].params[1]).toBe('other');
    expect(inserts[0].params[3]).toBe('https://github.com/foo');
    expect(inserts[1].params[1]).toBe('l'.repeat(50));
    expect(inserts[1].params[2]).toBe('x'.repeat(100));
  });

  it('stores blank numeric skill fields as NULL rather than the clamp floor', async () => {
    const { client, insertsInto } = buildClient();
    const skipped = await (service() as any).insertConfirmedFacts(client, 'candidate-1', 'doc-1', 'parsed-1', {
      skills: [
        { name: '   ' },
        { name: 'React', proficiency_level: '', years_of_experience: '' },
        { name: 'Node', proficiency_level: 15, years_of_experience: 1000 },
        'Python',
      ],
    });
    expect(skipped).toEqual({ skills: 1 });
    const inserts = insertsInto('candidate_skills');
    expect(inserts).toHaveLength(3);
    expect(inserts[0].params[3]).toBeNull();
    expect(inserts[0].params[4]).toBeNull();
    expect(inserts[1].params[3]).toBe(10);
    expect(inserts[1].params[4]).toBe(999.9);
    expect(inserts[2].params[2]).toBe('Python');
  });

  it('coerces non-array jsonb payloads to an empty array instead of violating jsonb_typeof', async () => {
    const { client, insertsInto } = buildClient();
    await (service() as any).insertConfirmedFacts(client, 'candidate-1', 'doc-1', 'parsed-1', {
      experiences: [{
        company_name: 'Acme', job_title: 'Engineer', start_date: '2021-05-01',
        responsibilities: 'shipped things', achievements: { a: 1 },
      }],
    });
    const params = insertsInto('candidate_experiences')[0].params;
    expect(params[9]).toBe('[]');
    expect(params[10]).toBe('[]');
  });

  it('returns an empty report when every row is valid', async () => {
    const { client } = buildClient();
    const skipped = await (service() as any).insertConfirmedFacts(client, 'candidate-1', 'doc-1', 'parsed-1', {
      skills: [{ name: 'React' }],
      experiences: [{ company_name: 'Acme', job_title: 'Engineer', start_date: '2021-05-01' }],
      links: [{ url: 'github.com/foo' }],
    });
    expect(skipped).toEqual({});
  });

  it('tolerates a facts payload with no recognised sections', async () => {
    const { client, calls } = buildClient();
    const skipped = await (service() as any).insertConfirmedFacts(client, 'candidate-1', 'doc-1', 'parsed-1', {});
    expect(skipped).toEqual({});
    expect(calls).toHaveLength(0);
  });
});

describe('insertConfirmedFacts unique-index guards', () => {
  // Verbatim from 08_candidates.sql:580-591. A drift here surfaces as a runtime 42P10
  // ("no unique or exclusion constraint matching the ON CONFLICT specification"), which
  // neither tsc nor a mocked query client can detect.
  const MASTER_SKILL_TARGET = 'ON CONFLICT (candidate_id, skill_id) WHERE deleted_at IS NULL AND skill_id IS NOT NULL DO UPDATE SET candidate_confirmed_at = NOW()';
  const CUSTOM_SKILL_TARGET = 'ON CONFLICT (candidate_id, lower(btrim(custom_skill_name))) WHERE deleted_at IS NULL AND skill_id IS NULL DO UPDATE SET candidate_confirmed_at = NOW()';
  const LANGUAGE_TARGET = 'ON CONFLICT (candidate_id, lower(btrim(language_name))) WHERE deleted_at IS NULL DO NOTHING';
  const LINK_TARGET = 'ON CONFLICT (candidate_id, lower(btrim(link_type)), lower(btrim(url))) WHERE deleted_at IS NULL DO NOTHING';

  const buildClient = (options: { catalogSkillId?: string } = {}) => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: jest.fn(async (sql: string, params: unknown[]) => {
        calls.push({ sql: String(sql), params: params ?? [] });
        if (String(sql).startsWith('SELECT id FROM public.skills')) {
          return { rows: options.catalogSkillId ? [{ id: options.catalogSkillId }] : [] };
        }
        return { rows: [{ id: 'inserted-row' }] };
      }),
    };
    const insertsInto = (table: string) => calls.filter((call) => call.sql.includes(`INSERT INTO public.${table} `));
    return { client, insertsInto };
  };

  const service = () => new ResumeService({ transaction: jest.fn() } as any, {} as any);

  const run = (client: any, facts: Record<string, unknown>) =>
    (service() as any).insertConfirmedFacts(client, 'candidate-1', 'doc-1', 'parsed-1', facts);

  it('targets uq_candidate_active_custom_skill when the skill is not in the catalog', async () => {
    const { client, insertsInto } = buildClient();
    await run(client, { skills: [{ name: 'React' }] });
    const insert = insertsInto('candidate_skills')[0];
    expect(insert.sql).toContain(CUSTOM_SKILL_TARGET);
    expect(insert.sql).not.toContain(MASTER_SKILL_TARGET);
    expect(insert.params[1]).toBeNull();
    expect(insert.params[2]).toBe('React');
  });

  it('targets uq_candidate_active_master_skill when the skill matches the catalog', async () => {
    const { client, insertsInto } = buildClient({ catalogSkillId: 'skill-uuid' });
    await run(client, { skills: [{ name: 'React' }] });
    const insert = insertsInto('candidate_skills')[0];
    expect(insert.sql).toContain(MASTER_SKILL_TARGET);
    expect(insert.sql).not.toContain(CUSTOM_SKILL_TARGET);
    expect(insert.params[1]).toBe('skill-uuid');
    expect(insert.params[2]).toBeNull();
  });

  it('re-affirms candidate_confirmed_at on skill conflict so RETURNING id still yields a row for evidence', async () => {
    const { client, insertsInto } = buildClient();
    await run(client, { skills: [{ name: 'React' }] });
    expect(insertsInto('candidate_skills')[0].sql).toContain('DO UPDATE SET candidate_confirmed_at = NOW() RETURNING id');
    expect(insertsInto('candidate_skill_evidence')).toHaveLength(1);
  });

  it('guards every skill row so a case-differing in-payload duplicate cannot abort the transaction', async () => {
    const { client, insertsInto } = buildClient();
    const skipped = await run(client, { skills: [{ name: 'React' }, { name: 'react' }, 'REACT'] });
    expect(skipped).toEqual({});
    const inserts = insertsInto('candidate_skills');
    expect(inserts).toHaveLength(3);
    expect(inserts.every((insert) => insert.sql.includes(CUSTOM_SKILL_TARGET))).toBe(true);
    expect(insertsInto('candidate_skill_evidence')).toHaveLength(3);
  });

  it('targets uq_candidate_active_language for language rows', async () => {
    const { client, insertsInto } = buildClient();
    const skipped = await run(client, { languages: [{ language_name: 'English' }, { language_name: 'english ' }] });
    expect(skipped).toEqual({});
    const inserts = insertsInto('candidate_languages');
    expect(inserts).toHaveLength(2);
    expect(inserts.every((insert) => insert.sql.includes(LANGUAGE_TARGET))).toBe(true);
  });

  it('targets uq_candidate_active_link_type_url for link rows', async () => {
    const { client, insertsInto } = buildClient();
    const skipped = await run(client, {
      links: [{ url: 'github.com/foo' }, { url: 'https://github.com/foo' }],
    });
    expect(skipped).toEqual({});
    const inserts = insertsInto('candidate_links');
    expect(inserts).toHaveLength(2);
    expect(inserts.every((insert) => insert.sql.includes(LINK_TARGET))).toBe(true);
    expect(inserts.map((insert) => insert.params[3])).toEqual(['https://github.com/foo', 'https://github.com/foo']);
  });

  it('leaves the unconstrained fact tables without a conflict clause', async () => {
    const { client, insertsInto } = buildClient();
    await run(client, {
      experiences: [{ company_name: 'Acme', job_title: 'Engineer', start_date: '2021-05-01' }],
      educations: [{ institution_name: 'DU', degree: 'BSc' }],
      certifications: [{ name: 'AWS' }],
      projects: [{ title: 'Portal' }],
      awards: [{ title: 'Hackathon' }],
    });
    for (const table of ['candidate_experiences', 'candidate_educations', 'candidate_certifications', 'candidate_projects', 'candidate_awards']) {
      expect(insertsInto(table)[0].sql).not.toContain('ON CONFLICT');
    }
  });
});