import { Module } from '@nestjs/common';
import { CallLogsController } from './call-logs.controller';
import { CallLogsService } from './call-logs.service';

@Module({
  controllers: [CallLogsController],
  providers: [CallLogsService],
})
export class CallLogsModule {}
