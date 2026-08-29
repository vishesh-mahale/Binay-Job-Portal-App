import { createHash } from 'node:crypto';

export type UploadedResume = { originalname?: string; mimetype?: string; size?: number; buffer?: Buffer };
export type ValidatedResume = { fileName: string; extension: string; mimeType: string; sizeBytes: number; checksumSha256: string };

const MIME_BY_EXTENSION: Record<string, string[]> = {
  pdf: ['application/pdf'],
  doc: ['application/msword'],
  docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
};

/** Pure, fail-closed validation; the caller supplies the approved configured size limit. */
export function validateResumeFile(file: UploadedResume, maxBytes: number): ValidatedResume {
  if (!file?.buffer || !file.originalname || !file.mimetype || !Number.isInteger(maxBytes) || maxBytes <= 0) throw new Error('VALIDATION_ERROR');
  if (file.buffer.length === 0 || file.buffer.length > maxBytes) throw new Error('VALIDATION_ERROR');
  const original = file.originalname.trim();
  if (original !== file.originalname || /[\\/]/.test(original) || original.includes('..')) throw new Error('VALIDATION_ERROR');
  const fileName = original;
  const match = /^.{1,255}\.([a-z0-9]{1,20})$/i.exec(fileName);
  if (!match) throw new Error('VALIDATION_ERROR');
  const extension = match[1].toLowerCase();
  const allowedMimes = MIME_BY_EXTENSION[extension];
  if (!allowedMimes || !allowedMimes.includes(file.mimetype.toLowerCase())) throw new Error('VALIDATION_ERROR');
  const isPdf = extension === 'pdf' && file.buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  const isZipDocx = extension === 'docx' && file.buffer[0] === 0x50 && file.buffer[1] === 0x4b;
  const isOleDoc = extension === 'doc' && file.buffer.subarray(0, 8).equals(Buffer.from('D0CF11E0A1B11AE1', 'hex'));
  if (!(isPdf || isZipDocx || isOleDoc)) throw new Error('VALIDATION_ERROR');
  return { fileName, extension, mimeType: file.mimetype.toLowerCase(), sizeBytes: file.buffer.length, checksumSha256: createHash('sha256').update(file.buffer).digest('hex') };
}