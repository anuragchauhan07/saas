import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { LoginDto, SignupDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(private supabase: SupabaseService) {}

  async signup(dto: SignupDto) {
    const db = this.supabase.client;

    // 1. Create the auth user (email pre-confirmed to keep the sprint moving)
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      email_confirm: true,
      user_metadata: { name: dto.name },
    });
    if (createErr || !created.user) {
      throw new BadRequestException(createErr?.message ?? 'Signup failed');
    }
    const userId = created.user.id;
    let orgId: string | undefined;

    try {
      // 2. Profile
      const { error: profErr } = await db
        .from('profiles')
        .insert({ id: userId, email: dto.email, name: dto.name ?? null });
      if (profErr) throw profErr;

      // 3. Default organization
      const orgName = `${dto.name ?? dto.email.split('@')[0]}'s Workspace`;
      const { data: org, error: orgErr } = await db
        .from('organizations')
        .insert({ name: orgName })
        .select('id')
        .single();
      if (orgErr) throw orgErr;
      orgId = org.id;

      // 4. Owner membership
      const { error: memErr } = await db
        .from('memberships')
        .insert({ org_id: orgId, user_id: userId, role: 'owner' });
      if (memErr) throw memErr;

      // 5. Free subscription
      const { error: subErr } = await db
        .from('subscriptions')
        .insert({ org_id: orgId, plan: 'free' });
      if (subErr) throw subErr;
    } catch (err) {
      // Roll back
      if (orgId) await db.from('organizations').delete().eq('id', orgId);
      await db.auth.admin.deleteUser(userId);
      throw new InternalServerErrorException('Could not complete signup');
    }

    return this.login({ email: dto.email, password: dto.password });
  }

  async login(dto: LoginDto) {
    const anon = this.supabase.newAnonClient();
    const { data, error } = await anon.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });
    if (error || !data.session) {
      throw new UnauthorizedException('Invalid email or password');
    }
    return this.sessionPayload(data.session, data.user);
  }

  async refresh(refreshToken: string) {
    const anon = this.supabase.newAnonClient();
    const { data, error } = await anon.auth.refreshSession({
      refresh_token: refreshToken,
    });
    if (error || !data.session || !data.user) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    return this.sessionPayload(data.session, data.user);
  }

  async me(userId: string) {
    const db = this.supabase.client;
    const { data: profile } = await db
      .from('profiles')
      .select('id, email, name')
      .eq('id', userId)
      .single();

    const { data: memberships } = await db
      .from('memberships')
      .select('role, organizations(id, name)')
      .eq('user_id', userId);

    return { profile, memberships };
  }

  private sessionPayload(
    session: { access_token: string; refresh_token: string; expires_at?: number },
    user: { id: string; email?: string },
  ) {
    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      expiresAt: session.expires_at,
      user: { id: user.id, email: user.email },
    };
  }
}