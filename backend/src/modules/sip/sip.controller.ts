import { Body, Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { SipService } from './sip.service';

@Controller()
export class SipController {
  constructor(private readonly sipService: SipService) {}

  @Get('sip')
  getSipAccounts() {
    return this.sipService.getSipAccounts();
  }

  @Post('sip')
  createSipAccount(@Body() body: any) {
    return this.sipService.createSipAccount(body);
  }

  @Put('sip/:id')
  updateSipAccount(@Param('id') id: string, @Body() body: any) {
    return this.sipService.updateSipAccount(id, body);
  }

  @Delete('sip/:id')
  deleteSipAccount(@Param('id') id: string) {
    return this.sipService.deleteSipAccount(id);
  }

  @Get('sip/:id/status')
  getSipStatus(@Param('id') id: string) {
    return this.sipService.getSipStatus(id);
  }

  @Get('sip-status')
  getSipLiveStatus() {
    return this.sipService.getSipLiveStatus();
  }

  @Post('test-call')
  testCall(@Body() body: any) {
    return this.sipService.testCall(body);
  }
}
