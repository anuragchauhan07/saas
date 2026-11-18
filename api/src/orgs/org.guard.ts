import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SupabaseService } from '../supabase/supabase.service';
import { Role, ROLES_KEY } from './roles.decorator';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Injectable()
export class OrgGuard implements CanActivate {
  constructor(
    private supabase: SupabaseService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (!req.user) throw new UnauthorizedException();

    const orgId = req.headers['x-org-id'];
    if (typeof orgId !== 'string' || !UUID_RE.test(orgId)) {
      throw new BadRequestException('Missing or invalid x-org-id header');
    }

    const { data: membership } = await this.supabase.client
      .from('memberships')
      .select('role')
      .eq('org_id', orgId)
      .eq('user_id', req.user.id)
      .maybeSingle();

    if (!membership) {
      throw new ForbiddenException('You are not a member of this organization');
    }

    const allowed = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (allowed?.length && !allowed.includes(membership.role as Role)) {
      throw new ForbiddenException('Insufficient role for this action');
    }

    req.org = { id: orgId, role: membership.role as Role };
    return true;
  }
}