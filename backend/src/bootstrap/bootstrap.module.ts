import { Module } from '@nestjs/common';
import { CampaignsModule } from '../modules/campaigns/campaigns.module';
import { BootstrapService } from './bootstrap.service';

@Module({
  imports: [CampaignsModule],
  providers: [BootstrapService],
})
export class BootstrapModule {}
