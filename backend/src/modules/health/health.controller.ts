import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppContextService } from '../../context/app-context.service';
import { DatabaseService } from '../../database/database.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly configService: ConfigService,
    private readonly appContextService: AppContextService,
  ) {}

  @Get()
  async getHealth() {
    await this.databaseService.query('SELECT 1');

    return {
      status: 'ok',
      time: new Date().toISOString(),
      database: this.configService.get<string>('PGDATABASE', 'cludedialer_portal'),
      organizationId: this.appContextService.getOrganizationId(),
    };
  }
}
