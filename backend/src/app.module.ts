import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AppContextModule } from './context/app-context.module';
import { BootstrapModule } from './bootstrap/bootstrap.module';
import { RealtimeModule } from './realtime/realtime.module';
import { TelephonyModule } from './telephony/telephony.module';
import { HealthModule } from './modules/health/health.module';
import { SipModule } from './modules/sip/sip.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { AudioModule } from './modules/audio/audio.module';
import { CampaignsModule } from './modules/campaigns/campaigns.module';
import { CallLogsModule } from './modules/call-logs/call-logs.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    DatabaseModule,
    AppContextModule,
    RealtimeModule,
    TelephonyModule,
    BootstrapModule,
    HealthModule,
    SipModule,
    ContactsModule,
    AudioModule,
    CampaignsModule,
    CallLogsModule,
  ],
})
export class AppModule {}
