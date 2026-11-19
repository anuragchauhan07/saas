import { Body, Controller, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ChatService } from './chat.service';
import { ChatDto } from './dto/chat.dto';
import { AuthGuard } from '../auth/auth.guard';
import { OrgGuard } from '../orgs/org.guard';
import { CurrentOrg } from '../orgs/current-org.decorator';
import type { OrgContext } from '../orgs/current-org.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/current-user.decorator';

@UseGuards(AuthGuard, OrgGuard)
@Controller('chat')
export class ChatController {
  constructor(private chat: ChatService) {}

  @Post()
  async ask(
    @CurrentOrg() org: OrgContext,
    @CurrentUser() user: AuthUser,
    @Body() dto: ChatDto,
    @Res() res: Response,
  ) {
    await this.chat.stream(org, user.id, dto, res);
  }
}