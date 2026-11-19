import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { SupabaseModule } from './supabase/supabase.module';
import { AuthModule } from './auth/auth.module';
import { OrgsModule } from './orgs/orgs.module';
import { AiModule } from './ai/ai.module';
import { DocumentsModule } from './documents/documents.module';
import { ChatModule } from './chat/chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const u = new URL(config.getOrThrow<string>('REDIS_URL'));
        return {
          connection: {
            host: u.hostname,
            port: Number(u.port || 6379),
            username: u.username || undefined,
            password: decodeURIComponent(u.password),
            tls: u.protocol === 'rediss:' ? {} : undefined,
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    SupabaseModule,
    AiModule,
    AuthModule,
    OrgsModule,
    DocumentsModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}