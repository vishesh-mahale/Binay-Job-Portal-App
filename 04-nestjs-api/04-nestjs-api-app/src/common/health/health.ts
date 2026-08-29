import { Controller, Get, Injectable } from '@nestjs/common';
import { DatabaseService } from '../../infrastructure/database/database';

@Injectable()
export class HealthService { constructor(private readonly db: DatabaseService) {} async ready(): Promise<boolean> { await this.db.query('SELECT 1'); return true; } }
@Controller('health')
export class HealthController { constructor(private readonly health: HealthService) {} @Get('liveness') live() { return { status: 'ok' }; } @Get('readiness') async readiness() { await this.health.ready(); return { status: 'ready' }; } }