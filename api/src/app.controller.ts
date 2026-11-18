import { Controller, Get, InternalServerErrorException } from '@nestjs/common';
import { AppService } from './app.service';
import { SupabaseService } from './supabase/supabase.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly supabase: SupabaseService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  async health() {
    const { count, error } = await this.supabase.client
      .from('organizations')
      .select('*', { count: 'exact', head: true });
    if (error) throw new InternalServerErrorException(error.message);
    return { ok: true, organizations: count };
  }
}