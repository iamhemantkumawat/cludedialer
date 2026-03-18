import { Module } from '@nestjs/common';
import { TelephonyModule } from '../../telephony/telephony.module';
import { CampaignsController } from './campaigns.controller';
import { CampaignRuntimeService } from './campaign-runtime.service';
import { CampaignsService } from './campaigns.service';

@Module({
  imports: [TelephonyModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, CampaignRuntimeService],
  exports: [CampaignsService, CampaignRuntimeService],
})
export class CampaignsModule {}
