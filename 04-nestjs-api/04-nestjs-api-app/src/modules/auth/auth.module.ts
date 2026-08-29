import { Module } from '@nestjs/common';
import { AuthProviderController } from './auth-provider';

@Module({ controllers: [AuthProviderController] })
export class AuthModule {}
