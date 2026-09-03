import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { loadConfig } from './infrastructure/config/config';
import { ApiExceptionFilter } from './common/errors/errors';
import { requestContext } from './common/context/request-context';
import { SafeLogger } from './common/observability/observability';
import cookieParser from 'cookie-parser';

async function bootstrap() { const config = loadConfig(); const app = await NestFactory.create(AppModule, { bufferLogs: true }); app.use(cookieParser()); if (config.TRUST_PROXY) app.getHttpAdapter().getInstance().set('trust proxy', true); if (config.CORS_ORIGINS) { const origins = config.CORS_ORIGINS.split(',').map((value) => value.trim()).filter(Boolean); if (origins.length) app.enableCors({ origin: origins, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] }); } app.use(requestContext); app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })); app.useGlobalFilters(new ApiExceptionFilter()); app.useLogger(new SafeLogger()); app.enableShutdownHooks(); await app.listen(config.PORT, '0.0.0.0'); }
bootstrap().catch((error) => { console.error('API_STARTUP_FAILED', error); process.exitCode = 1; });