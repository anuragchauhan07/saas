import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { DocumentsProcessor } from './documents.processor';

@Module({
  imports: [BullModule.registerQueue({ name: 'documents' })],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentsProcessor],
})
export class DocumentsModule {}