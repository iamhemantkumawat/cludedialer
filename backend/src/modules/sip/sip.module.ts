import { Module } from '@nestjs/common';
import { TelephonyModule } from '../../telephony/telephony.module';
import { SipController } from './sip.controller';
import { SipService } from './sip.service';

@Module({
  imports: [TelephonyModule],
  controllers: [SipController],
  providers: [SipService],
  exports: [SipService],
})
export class SipModule {}
