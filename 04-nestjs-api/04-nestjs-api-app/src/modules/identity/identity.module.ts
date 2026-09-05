import { Module } from '@nestjs/common';
import { IdentityController, IdentityService } from './identity-company';
import { CompanyController, CompanyService } from './companies';
import { OrganizationController, OrganizationService } from './organization';
import { MembershipController, MembershipService } from './membership';
import { OwnershipController, OwnershipService } from './ownership';
import { CompanySettingsController, CompanySettingsService } from './company-settings';
import { AdminCompanyController, AdminCompanyService } from './admin-company';
import { CompanyInvitationController, CompanyInvitationService } from './company-invitation';
import { OutboxWorkerService, BrevoEmailService } from './outbox-worker';

@Module({
  controllers: [
    IdentityController,
    CompanyController,
    OrganizationController,
    MembershipController,
    OwnershipController,
    CompanySettingsController,
    AdminCompanyController,
    CompanyInvitationController,
  ],
  providers: [
    IdentityService,
    CompanyService,
    OrganizationService,
    MembershipService,
    OwnershipService,
    CompanySettingsService,
    AdminCompanyService,
    CompanyInvitationService,
    BrevoEmailService,
    OutboxWorkerService,
  ],
  exports: [CompanyInvitationService, BrevoEmailService, OutboxWorkerService],
})
export class IdentityModule {}
