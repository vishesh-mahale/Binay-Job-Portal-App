import { Injectable, LoggerService } from '@nestjs/common';

const SECRET = /(bearer\s+|password|token|secret|api[_-]?key|authorization)([=:]\s*|\s+)[^\s,;]+/gi;
export function redact(value: string): string { return value.replace(SECRET, '$1$2[REDACTED]'); }

@Injectable()
export class SafeLogger implements LoggerService {
  log(message: unknown, context?: string) { console.log(JSON.stringify({ level: 'info', context, message: redact(String(message)) })); }
  error(message: unknown, trace?: string, context?: string) { console.error(JSON.stringify({ level: 'error', context, message: redact(String(message)), trace: trace ? '[REDACTED]' : undefined })); }
  warn(message: unknown, context?: string) { console.warn(JSON.stringify({ level: 'warn', context, message: redact(String(message)) })); }
  debug(message: unknown, context?: string) { if (process.env.LOG_LEVEL === 'debug') console.debug(JSON.stringify({ level: 'debug', context, message: redact(String(message)) })); }
  verbose(message: unknown, context?: string) { this.debug(message, context); }
}