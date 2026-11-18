import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Role } from './roles.decorator';

export interface OrgContext {
  id: string;
  role: Role;
}

export const CurrentOrg = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): OrgContext =>
    ctx.switchToHttp().getRequest().org,
);