import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { AuthGuard } from '../auth/auth.guard';
import { OrgGuard } from '../orgs/org.guard';
import { Roles } from '../orgs/roles.decorator';
import { CurrentOrg } from '../orgs/current-org.decorator';
import type { OrgContext } from '../orgs/current-org.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';
import { CreateUploadDto } from './dto/documents.dto';

@UseGuards(AuthGuard, OrgGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private docs: DocumentsService) {}

  @Post('upload-url')
  uploadUrl(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateUploadDto,
  ) {
    return this.docs.createUpload(org, user.id, dto);
  }

  @Post(':id/complete')
  complete(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
  ) {
    return this.docs.complete(org, user.id, id);
  }

  @Get()
  list(@CurrentOrg() org: OrgContext) {
    return this.docs.list(org.id);
  }

  @Get(':id')
  get(@CurrentOrg() org: OrgContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.docs.get(org.id, id);
  }

  @Roles('owner', 'admin')
  @Delete(':id')
  remove(@CurrentOrg() org: OrgContext, @Param('id', new ParseUUIDPipe()) id: string) {
    return this.docs.remove(org.id, id);
  }
}