import { Module } from '@nestjs/common';
import { loadConfig } from './infrastructure/config/config';
import { DatabaseService } from './infrastructure/database/database';
import { HealthController, HealthService } from './common/health/health';
import { UserContextClient, SystemClient } from './infrastructure/database/clients';
import { AuthGuard } from './modules/auth/auth';
import { JoseJwtVerifier } from './security/jwt-verifier';
import { IdentityController, IdentityService } from './modules/identity/identity-company';
import { CompanyController, CompanyService } from './modules/identity/companies';
import { OrganizationController, OrganizationService } from './modules/identity/organization';
import { MembershipController, MembershipService } from './modules/identity/membership';
import { OwnershipController, OwnershipService } from './modules/identity/ownership';
import { CandidateController, CandidateService, ResumeStatusController } from './modules/candidates/candidate';
import { StorageAdapter, SupabaseStorageAdapter } from './infrastructure/storage/storage';
import { ResumeController, ResumeService } from './modules/candidates/resume';
import { GuestSessionController, GuestSessionService } from './modules/candidates/guest';
import { AuthProviderController, SupabaseAuthProvider } from './modules/auth/auth-provider';
import { AuthAuditService } from './modules/auth/auth-audit';
import { JobController, JobService } from './modules/jobs/jobs';
import { ApplicationController, ApplicationStatusController, CandidateApplicationReadController, CompanyApplicationReadController, ApplicationService } from './modules/applications/applications';
import { SavedCandidateController, SavedCandidateService } from './modules/applications/saved-candidates';
import { FeedbackController, FeedbackService } from './modules/analytics/feedback';
import { AnalyticsController, AnalyticsService } from './modules/analytics/analytics';
import { InterviewController, InterviewService } from './modules/interviews/interviews';
import { CompanySettingsController, CompanySettingsService } from './modules/identity/company-settings';

const config = loadConfig();
const jwtKey = config.SUPABASE_JWKS_URL
  ? { jwksUrl: config.SUPABASE_JWKS_URL }
  : config.SUPABASE_URL
    ? { jwksUrl: `${config.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json` }
    : config.SUPABASE_JWT_SECRET!;
@Module({ controllers:[HealthController, AuthProviderController, IdentityController, CompanyController, OrganizationController, MembershipController, OwnershipController, CandidateController, ResumeStatusController, ResumeController, GuestSessionController, JobController, ApplicationController, ApplicationStatusController, CandidateApplicationReadController, CompanyApplicationReadController, SavedCandidateController, FeedbackController, AnalyticsController, InterviewController, CompanySettingsController], providers:[{ provide:'APP_CONFIG', useValue:config }, { provide:DatabaseService, useFactory:()=>new DatabaseService(config) }, { provide:HealthService, useFactory:(db:DatabaseService)=>new HealthService(db), inject:[DatabaseService] }, { provide:'JWT_VERIFICATION_KEY', useValue:jwtKey }, { provide:'JWT_VERIFIER', useFactory:()=>new JoseJwtVerifier() }, { provide:'JWT_OPTIONS', useValue:{ issuer: config.SUPABASE_JWT_ISSUER, audience: config.SUPABASE_JWT_AUDIENCE } }, AuthGuard, { provide:SupabaseAuthProvider, useFactory:()=>new SupabaseAuthProvider(config) }, { provide:StorageAdapter, useClass:SupabaseStorageAdapter }, UserContextClient, SystemClient, AuthAuditService, IdentityService, CompanyService, OrganizationService, MembershipService, OwnershipService, CandidateService, ResumeService, GuestSessionService, JobService, ApplicationService, SavedCandidateService, FeedbackService, AnalyticsService, InterviewService, CompanySettingsService] })
export class AppModule {}