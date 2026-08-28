import { Module } from '@nestjs/common';
import { loadConfig } from './config';
import { DatabaseService } from './database';
import { HealthController, HealthService } from './health';
import { UserContextClient, SystemClient } from './clients';
import { AuthGuard } from './auth';
import { IdentityController, IdentityService } from './identity-company';
import { CompanyController, CompanyService } from './companies';
import { OrganizationController, OrganizationService } from './organization';
import { MembershipController, MembershipService } from './membership';
import { OwnershipController, OwnershipService } from './ownership';
import { CandidateController, CandidateService, ResumeStatusController } from './candidate';
import { StorageAdapter, SupabaseStorageAdapter } from './storage';
import { ResumeController, ResumeService } from './resume';
import { GuestSessionController, GuestSessionService } from './guest';
import { AuthProviderController, SupabaseAuthProvider } from './auth-provider';
import { AuthAuditService } from './auth-audit';
import { JobController, JobService } from './jobs';
import { ApplicationController, ApplicationStatusController, CandidateApplicationReadController, CompanyApplicationReadController, ApplicationService } from './applications';
import { SavedCandidateController, SavedCandidateService } from './saved-candidates';
import { FeedbackController, FeedbackService } from './feedback';
import { AnalyticsController, AnalyticsService } from './analytics';
import { InterviewController, InterviewService } from './interviews';

const config = loadConfig();
@Module({ controllers:[HealthController, AuthProviderController, IdentityController, CompanyController, OrganizationController, MembershipController, OwnershipController, CandidateController, ResumeStatusController, ResumeController, GuestSessionController, JobController, ApplicationController, ApplicationStatusController, CandidateApplicationReadController, CompanyApplicationReadController, SavedCandidateController, FeedbackController, AnalyticsController, InterviewController], providers:[{ provide:'APP_CONFIG', useValue:config }, { provide:DatabaseService, useFactory:()=>new DatabaseService(config) }, { provide:HealthService, useFactory:(db:DatabaseService)=>new HealthService(db), inject:[DatabaseService] }, { provide:AuthGuard, useFactory:()=>new AuthGuard(config.SUPABASE_JWT_SECRET, undefined, { issuer: config.SUPABASE_JWT_ISSUER, audience: config.SUPABASE_JWT_AUDIENCE }) }, { provide:SupabaseAuthProvider, useFactory:()=>new SupabaseAuthProvider(config) }, { provide:StorageAdapter, useClass:SupabaseStorageAdapter }, UserContextClient, SystemClient, AuthAuditService, IdentityService, CompanyService, OrganizationService, MembershipService, OwnershipService, CandidateService, ResumeService, GuestSessionService, JobService, ApplicationService, SavedCandidateService, FeedbackService, AnalyticsService, InterviewService] })
export class AppModule {}
