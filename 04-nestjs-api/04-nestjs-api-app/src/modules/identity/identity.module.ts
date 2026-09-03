import { Module } from '@nestjs/common';
import { IdentityController, IdentityService } from './identity-company';
import { CompanyController, CompanyService } from './companies';
import { OrganizationController, OrganizationService } from './organization';
import { MembershipController, MembershipService } from './membership';
import { OwnershipController, OwnershipService } from './ownership';
import { CompanySettingsController, CompanySettingsService } from './company-settings';
import { AdminCompanyController, AdminCompanyService } from './admin-company';

@Module({
  controllers: [IdentityController, CompanyController, OrganizationController, MembershipController, OwnershipController, CompanySettingsController, AdminCompanyController],
  providers: [IdentityService, CompanyService, OrganizationService, MembershipService, OwnershipService, CompanySettingsService, AdminCompanyService],
})
export class IdentityModule {}
