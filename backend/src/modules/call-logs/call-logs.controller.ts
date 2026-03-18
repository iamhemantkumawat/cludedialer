import { Controller, Get, Query } from '@nestjs/common';
import { CallLogsService } from './call-logs.service';

@Controller('call-logs')
export class CallLogsController {
  constructor(private readonly callLogsService: CallLogsService) {}

  @Get()
  getCallLogs(
    @Query('q') query?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.callLogsService.getCallLogs({
      query,
      status,
      page: Number(page || 1),
      limit: Number(limit || 50),
    });
  }
}
