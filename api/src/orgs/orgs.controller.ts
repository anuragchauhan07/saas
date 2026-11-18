import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { OrgsService } from './orgs.service';
import { AuthGuard } from '../auth/auth.guard';
import { OrgGuard } from './org.guard';
import { Roles } from './roles.decorator';
import { CurrentOrg } from './current-org.decorator';
import type { OrgContext } from './current-org.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { AcceptInviteDto, CreateOrgDto, InviteDto } from './dto/orgs.dto';

@Controller()
export class OrgsController {
  constructor(private orgs: OrgsService) {}

  // Auth only (no org context yet)
  @UseGuards(AuthGuard)
  @Post('orgs')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateOrgDto) {
    return this.orgs.create(user.id, dto.name);
  }

  @UseGuards(AuthGuard)
  @Post('invites/accept')
  accept(@CurrentUser() user: AuthUser, @Body() dto: AcceptInviteDto) {
    return this.orgs.acceptInvite(user, dto.token);
  }

  // Org-scoped (x-org-id header required)
  @UseGuards(AuthGuard, OrgGuard)
  @Get('orgs/current')
  current(@CurrentOrg() org: OrgContext) {
    return this.orgs.current(org);
  }

  @UseGuards(AuthGuard, OrgGuard)
  @Get('orgs/current/members')
  members(@CurrentOrg() org: OrgContext) {
    return this.orgs.members(org.id);
  }

  @UseGuards(AuthGuard, OrgGuard)
  @Roles('owner', 'admin')
  @Post('orgs/current/invites')
  invite(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: InviteDto,
  ) {
    return this.orgs.invite(org, user.id, dto.email, dto.role);
  }

  @UseGuards(AuthGuard, OrgGuard)
  @Roles('owner', 'admin')
  @Delete('orgs/current/members/:userId')
  remove(
    @CurrentOrg() org: OrgContext,
    @Param('userId', new ParseUUIDPipe()) userId: string,
  ) {
    return this.orgs.removeMember(org, userId);
  }
}