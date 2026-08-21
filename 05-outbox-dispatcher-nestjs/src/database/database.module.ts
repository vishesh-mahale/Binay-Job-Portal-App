import { Module } from '@nestjs/common';
import { DatabaseService } from './database.service';
import { OutboxRepository } from './outbox.repository';

@Module({
  providers: [DatabaseService, OutboxRepository],
  exports: [DatabaseService, OutboxRepository],
})
export class DatabaseModule {}
