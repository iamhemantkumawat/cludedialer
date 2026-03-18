import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFileSync } from 'fs';
import { DatabaseService } from '../database/database.service';
import { AppContextService } from '../context/app-context.service';

const AsteriskManager = require('asterisk-manager');

type OriginateCallInput = {
  channel: string;
  variables?: Record<string, string>;
  actionId: string;
  callerId?: string;
  timeout?: number;
};

@Injectable()
export class TelephonyService {
  private readonly logger = new Logger(TelephonyService.name);
  private ami: any = null;
  private connecting = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly databaseService: DatabaseService,
    private readonly appContextService: AppContextService,
  ) {}

  private get port() {
    return Number(this.configService.get<string>('AMI_PORT', '5038'));
  }

  private get host() {
    return this.configService.get<string>('AMI_HOST', 'localhost');
  }

  private get user() {
    return this.configService.get<string>('AMI_USER', 'autodialer_bot');
  }

  private get secret() {
    return this.configService.get<string>('AMI_SECRET', '');
  }

  private ensureAmi() {
    if (this.ami || this.connecting || !this.secret) {
      return;
    }

    this.connecting = true;

    try {
      this.ami = new AsteriskManager(this.port, this.host, this.user, this.secret, true);
      this.ami.keepConnected();
      this.ami.on('connect', () => this.logger.log('Connected to Asterisk AMI'));
      this.ami.on('close', () => this.logger.warn('AMI connection closed'));
      this.ami.on('error', (error: Error) => this.logger.error(`AMI error: ${error.message}`));
      this.ami.on('invalidpass', () => this.logger.error('AMI invalid password'));
    } catch (error: any) {
      this.logger.error(`Failed to initialize AMI: ${error.message}`);
      this.ami = null;
    } finally {
      this.connecting = false;
    }
  }

  private callAction(action: Record<string, any>) {
    this.ensureAmi();

    if (!this.ami) {
      return Promise.reject(new Error('AMI is not available'));
    }

    return new Promise<any>((resolve, reject) => {
      this.ami.action(action, (error: Error | null, response: any) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(response);
      });
    });
  }

  async sendCommand(command: string) {
    try {
      const result = await this.callAction({ Action: 'Command', Command: command });
      return { err: null, res: result };
    } catch (error: any) {
      return { err: error, res: null };
    }
  }

  initializeManager() {
    this.ensureAmi();
    return Boolean(this.ami);
  }

  subscribeManagerEvents(listener: (event: any) => void) {
    this.ensureAmi();

    if (!this.ami) {
      this.logger.warn('AMI is not available; manager event subscription skipped');
      return () => undefined;
    }

    this.ami.on('managerevent', listener);

    return () => {
      if (!this.ami) {
        return;
      }

      if (typeof this.ami.off === 'function') {
        this.ami.off('managerevent', listener);
        return;
      }

      if (typeof this.ami.removeListener === 'function') {
        this.ami.removeListener('managerevent', listener);
      }
    };
  }

  async originateCall(input: OriginateCallInput) {
    const variableArray = Object.entries(input.variables || {}).map(([key, value]) => `${key}=${value}`);

    return this.callAction({
      Action: 'Originate',
      Channel: input.channel,
      Context: 'from-autodialer',
      Exten: 's',
      Priority: '1',
      Timeout: String(input.timeout || 30000),
      CallerID: input.callerId || 'AutoDialer <0000000000>',
      Async: 'true',
      ActionID: input.actionId,
      Variable: variableArray,
    });
  }

  async getSipStatusSnapshot() {
    const registryResult = await this.sendCommand('sip show registry');
    const peerResult = await this.sendCommand('sip show peers');

    const registry = this.asText(registryResult.res?.output);
    const peers = this.asText(peerResult.res?.output);

    return {
      registry,
      peers,
      registered: registry.includes('Registered'),
    };
  }

  async isUsernameRegistered(username: string) {
    const snapshot = await this.getSipStatusSnapshot();
    const registered = snapshot.registry
      .split('\n')
      .some((line) => line.includes(username) && line.includes('Registered'));

    return {
      output: snapshot.registry,
      registered,
    };
  }

  async reloadSipConfiguration() {
    try {
      await this.writeSipConfiguration();
    } catch (error: any) {
      this.logger.warn(`Skipping sip config write: ${error.message}`);
    }

    const reload = await this.sendCommand('sip reload');
    if (reload.err) {
      this.logger.warn(`sip reload failed: ${reload.err.message}`);
    }

    await this.sleep(1000);

    const moduleReload = await this.sendCommand('module reload chan_sip.so');
    if (moduleReload.err) {
      this.logger.warn(`module reload failed: ${moduleReload.err.message}`);
    }
  }

  private async writeSipConfiguration() {
    const sipConfPath = this.configService.get<string>('ASTERISK_SIP_CONF');
    if (!sipConfPath) {
      throw new Error('ASTERISK_SIP_CONF is not configured');
    }

    const organizationId = this.appContextService.getOrganizationId();
    const trunks = await this.databaseService.many<{
      username: string;
      password: string;
      domain: string;
    }>(
      `
        SELECT
          username,
          password_ciphertext AS password,
          domain
        FROM sip_trunks
        WHERE organization_id = $1
          AND deleted_at IS NULL
          AND active = true
        ORDER BY created_at ASC
      `,
      [organizationId],
    );

    let content = '; Auto-generated by CyberX AutoDialer\n';
    content += '; Register lines\n';

    for (const trunk of trunks) {
      content += `register => ${trunk.username}:${trunk.password}@${trunk.domain}/${trunk.username}\n`;
    }

    content += '\n; Peer configs\n';

    for (const trunk of trunks) {
      content += `
[${trunk.username}]
type=peer
secret=${trunk.password}
username=${trunk.username}
host=${trunk.domain}
fromdomain=${trunk.domain}
fromuser=${trunk.username}
defaultuser=${trunk.username}
context=from-trunk
disallow=all
allow=ulaw
allow=alaw
allow=gsm
insecure=port,invite
qualify=yes
dtmfmode=rfc2833
nat=force_rport,comedia
directmedia=no
`;
    }

    writeFileSync(sipConfPath, content, 'utf8');
    this.logger.log(`Wrote SIP config to ${sipConfPath}`);
  }

  private asText(value: unknown) {
    if (Array.isArray(value)) {
      return value.join('\n');
    }
    return String(value || '');
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
