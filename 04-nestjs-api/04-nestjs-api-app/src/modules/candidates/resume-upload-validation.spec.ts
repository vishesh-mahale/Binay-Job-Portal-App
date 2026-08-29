import { validateResumeFile } from './resume-upload-validation';

describe('resume upload validation', () => {
  it('accepts a PDF and computes its checksum', () => {
    const result = validateResumeFile({ originalname: 'resume.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-1.7 body') }, 1024);
    expect(result.extension).toBe('pdf');
    expect(result.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects mismatched MIME or magic bytes', () => {
    expect(() => validateResumeFile({ originalname: 'resume.pdf', mimetype: 'text/plain', buffer: Buffer.from('%PDF-') }, 1024)).toThrow('VALIDATION_ERROR');
    expect(() => validateResumeFile({ originalname: 'resume.pdf', mimetype: 'application/pdf', buffer: Buffer.from('not-pdf') }, 1024)).toThrow('VALIDATION_ERROR');
  });

  it('rejects path traversal, oversized and unsupported files', () => {
    expect(() => validateResumeFile({ originalname: '../resume.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-') }, 1024)).toThrow('VALIDATION_ERROR');
    expect(() => validateResumeFile({ originalname: 'resume.pdf', mimetype: 'application/pdf', buffer: Buffer.from('%PDF-12345') }, 5)).toThrow('VALIDATION_ERROR');
    expect(() => validateResumeFile({ originalname: 'resume.txt', mimetype: 'text/plain', buffer: Buffer.from('x') }, 1024)).toThrow('VALIDATION_ERROR');
  });
});