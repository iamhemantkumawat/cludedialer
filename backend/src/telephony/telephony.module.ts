import { Module } from '@nestjs/common';
import { TelephonyService } from './telephony.service';

@Module({
  providers: [TelephonyService],
  exports: [TelephonyService],
})
export class TelephonyModule {}
