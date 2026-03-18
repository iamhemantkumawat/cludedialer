import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';

@Controller('campaigns')
export class CampaignsController {
  constructor(private readonly campaignsService: CampaignsService) {}

  @Get()
  getCampaigns() {
    return this.campaignsService.getCampaigns();
  }

  @Get('history')
  getCampaignHistory() {
    return this.campaignsService.getCampaignHistory();
  }

  @Get(':id')
  getCampaign(@Param('id') id: string) {
    return this.campaignsService.getCampaign(id);
  }

  @Post()
  createCampaign(@Body() body: any) {
    return this.campaignsService.createCampaign(body);
  }

  @Post(':id/start')
  startCampaign(@Param('id') id: string) {
    return this.campaignsService.startCampaign(id);
  }

  @Post(':id/pause')
  pauseCampaign(@Param('id') id: string) {
    return this.campaignsService.pauseCampaign(id);
  }

  @Post(':id/stop')
  stopCampaign(@Param('id') id: string) {
    return this.campaignsService.stopCampaign(id);
  }

  @Delete(':id')
  deleteCampaign(@Param('id') id: string) {
    return this.campaignsService.deleteCampaign(id);
  }

  @Get(':id/results')
  getCampaignResults(@Param('id') id: string) {
    return this.campaignsService.getCampaignResults(id);
  }

  @Get(':id/dtmf-summary')
  getCampaignDtmfSummary(@Param('id') id: string) {
    return this.campaignsService.getCampaignDtmfSummary(id);
  }

  @Get(':id/contacts')
  getCampaignContacts(@Param('id') id: string, @Query('page') page?: string, @Query('limit') limit?: string) {
    return this.campaignsService.getCampaignContacts(id, Number(page || 1), Number(limit || 100));
  }
}
