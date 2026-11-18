import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import type { OrgContext } from './current-org.decorator';

@Injectable()
export class OrgsService {
  constructor(
    private supabase: SupabaseService,
    private config: ConfigService,
  ) {}

  private get db() {
    return this.supabase.client;
  }

  async create(userId: string, name: string) {
    const { data: org, error } = await this.db
      .from('organizations')
      .insert({ name })
      .select('id, name')
      .single();
    if (error || !org) throw new InternalServerErrorException('Could not create org');

    const { error: memErr } = await this.db
      .from('memberships')
      .insert({ org_id: org.id, user_id: userId, role: 'owner' });
    const { error: subErr } = await this.db
      .from('subscriptions')
      .insert({ org_id: org.id, plan: 'free' });

    if (memErr || subErr) {
      await this.db.from('organizations').delete().eq('id', org.id);
      throw new InternalServerErrorException('Could not create org');
    }
    return org;
  }

  async current(org: OrgContext) {
    const { data } = await this.db
      .from('organizations')
      .select('id, name, created_at, subscriptions(plan, status)')
      .eq('id', org.id)
      .single();
    return { ...data, role: org.role };
  }

  async members(orgId: string) {
    const { data, error } = await this.db
      .from('memberships')
      .select('role, created_at, profiles(id, email, name)')
      .eq('org_id', orgId)
      .order('created_at');
    if (error) throw new InternalServerErrorException(error.message);
    return data;
  }

  async invite(org: OrgContext, invitedBy: string, email: string, role: 'admin' | 'member') {
    if (role === 'admin' && org.role !== 'owner') {
      throw new ForbiddenException('Only owners can invite admins');
    }
    const normalized = email.toLowerCase();
    const token = randomBytes(24).toString('hex');

    const { error } = await this.db.from('invitations').insert({
      org_id: org.id,
      email: normalized,
      role,
      token,
      invited_by: invitedBy,
    });
    if (error) throw new InternalServerErrorException(error.message);

    const webUrl = this.config.get<string>('WEB_URL') ?? 'http://localhost:3000';
    return { email: normalized, role, inviteLink: `${webUrl}/invite/${token}` };
  }

  async acceptInvite(user: { id: string; email?: string }, token: string) {
    const { data: invite } = await this.db
      .from('invitations')
      .select('*')
      .eq('token', token)
      .maybeSingle();

    if (!invite) throw new NotFoundException('Invitation not found');
    if (invite.accepted_at) throw new BadRequestException('Invitation already used');
    if (new Date(invite.expires_at) < new Date()) {
      throw new BadRequestException('Invitation expired');
    }
    if (invite.email !== user.email?.toLowerCase()) {
      throw new ForbiddenException('This invitation was sent to a different email');
    }

    const { error } = await this.db
      .from('memberships')
      .insert({ org_id: invite.org_id, user_id: user.id, role: invite.role });
    if (error) {
      if (error.code === '23505') throw new ConflictException('Already a member');
      throw new InternalServerErrorException(error.message);
    }

    await this.db
      .from('invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invite.id);

    return { orgId: invite.org_id, role: invite.role };
  }

  async removeMember(org: OrgContext, targetUserId: string) {
    const { data: target } = await this.db
      .from('memberships')
      .select('role')
      .eq('org_id', org.id)
      .eq('user_id', targetUserId)
      .maybeSingle();

    if (!target) throw new NotFoundException('Member not found');
    if (target.role === 'owner') {
      throw new ForbiddenException('The owner cannot be removed');
    }
    if (target.role === 'admin' && org.role !== 'owner') {
      throw new ForbiddenException('Only owners can remove admins');
    }

    const { error } = await this.db
      .from('memberships')
      .delete()
      .eq('org_id', org.id)
      .eq('user_id', targetUserId);
    if (error) throw new InternalServerErrorException(error.message);
    return { removed: true };
  }
}