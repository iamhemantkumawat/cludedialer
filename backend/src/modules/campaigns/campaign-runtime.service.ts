import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { basename, extname } from 'path';
import { randomUUID } from 'crypto';
import { PoolClient } from 'pg';
import { AppContextService } from '../../context/app-context.service';
import { DatabaseService } from '../../database/database.service';
import { EventsGateway } from '../../realtime/events.gateway';
import { TelephonyService } from '../../telephony/telephony.service';
import { normalizePhone } from '../../common/phone.util';

type CampaignRuntimeState = {
  id: string;
  organization_id: string;
  status: string;
  max_concurrent_calls: number;
  dtmf_digits: number;
  sip_trunk_id: string | null;
  sip_username: string | null;
  caller_id_id: string | null;
  caller_id_number: string | null;
  audio_storage_key: string | null;
  audio_asterisk_path: string | null;
  legacy_audio_file: string | null;
  current_run_id: string | null;
};

type ClaimedTarget = {
  id: string;
  contact_id: string | null;
  phone_e164: string;
  display_name: string | null;
  attempts_made: number;
};

type CampaignWorker = {
  campaignId: string;
  runId: string | null;
  running: boolean;
  loopPromise?: Promise<void>;
};

type ActiveCallContext = {
  actionId: string;
  organizationId: string;
  campaignId: string;
  campaignRunId: string | null;
  campaignTargetId: string;
  contactId: string | null;
  phoneNumber: string;
  sipTrunkId: string | null;
  callerIdId: string | null;
  sipUsername: string | null;
  callerIdNumber: string | null;
  callId: string;
  callAttemptId: string;
  startedAt: Date;
  answeredAt: Date | null;
  terminalDisposition: string | null;
  dtmf: string;
  asteriskChannel: string | null;
};

type TerminalOutcome = {
  dispositionLower: string;
  dispositionUpper: string;
  endedAt?: Date;
  answeredAt?: Date | null;
  dtmf?: string;
  failureCode?: string | null;
  failureReason?: string | null;
  hangupSource: 'asterisk' | 'system';
  rawPayload?: Record<string, any>;
};

type NormalizedManagerEvent = Record<string, string>;

@Injectable()
export class CampaignRuntimeService implements OnModuleDestroy {
  private readonly logger = new Logger(CampaignRuntimeService.name);
  private readonly activeCalls = new Map<string, ActiveCallContext>();
  private readonly workers = new Map<string, CampaignWorker>();
  private unsubscribeManagerEvents?: () => void;
  private initialized = false;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly appContextService: AppContextService,
    private readonly eventsGateway: EventsGateway,
    private readonly telephonyService: TelephonyService,
    private readonly configService: ConfigService,
  ) {}

  async initializeRuntime() {
    if (this.initialized) {
      return;
    }

    const organizationId = this.appContextService.getOrganizationId();
    if (!organizationId) {
      this.logger.warn('Campaign runtime skipped because organization context is not ready');
      return;
    }

    await this.resetStaleRuntimeState();
    this.telephonyService.initializeManager();
    this.unsubscribeManagerEvents = this.telephonyService.subscribeManagerEvents(this.onManagerEvent);
    this.initialized = true;
    this.logger.log('Campaign runtime initialized');
  }

  onModuleDestroy() {
    for (const worker of this.workers.values()) {
      worker.running = false;
    }

    this.workers.clear();
    this.activeCalls.clear();
    this.unsubscribeManagerEvents?.();
    this.unsubscribeManagerEvents = undefined;
    this.initialized = false;
  }

  async startCampaign(campaignId: string) {
    const campaign = await this.loadCampaignRuntimeState(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    if (!campaign.sip_username || !campaign.sip_trunk_id) {
      throw new Error('Campaign SIP account is missing');
    }

    const audioPath = this.resolveAudioPath(campaign);
    if (!audioPath) {
      throw new Error('Campaign audio file is missing');
    }

    if (campaign.status === 'running') {
      this.ensureWorkerRunning(campaignId, campaign.current_run_id || null);
      await this.emitCampaignStats(campaignId);
      return { message: 'Campaign already running' };
    }

    const runId = await this.databaseService.tx(async (client) => {
      const nextRunResult = await client.query<{ next_run: number }>(
        `
          SELECT COALESCE(MAX(run_number), 0) + 1 AS next_run
          FROM campaign_runs
          WHERE campaign_id = $1
        `,
        [campaignId],
      );

      const runId = randomUUID();

      await client.query(
        `
          UPDATE campaigns
          SET
            status = 'running',
            launched_by_user_id = $3,
            updated_at = now()
          WHERE organization_id = $1
            AND id = $2
        `,
        [campaign.organization_id, campaignId, this.appContextService.getBootstrapUserId()],
      );

      await client.query(
        `
          INSERT INTO campaign_runs (
            id,
            organization_id,
            campaign_id,
            run_number,
            status,
            triggered_by_user_id,
            summary,
            started_at,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, 'running', $5, '{}'::jsonb, now(), now(), now())
        `,
        [
          runId,
          campaign.organization_id,
          campaignId,
          Number(nextRunResult.rows[0]?.next_run || 1),
          this.appContextService.getBootstrapUserId(),
        ],
      );

      return runId;
    });

    this.eventsGateway.emitCampaignUpdate({ id: campaignId, status: 'running' });
    await this.emitCampaignStats(campaignId);
    this.ensureWorkerRunning(campaignId, runId);
    return { message: 'Campaign started' };
  }

  async pauseCampaign(campaignId: string) {
    const campaign = await this.loadCampaignRuntimeState(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    await this.databaseService.tx(async (client) => {
      await client.query(
        `
          UPDATE campaigns
          SET status = 'paused', updated_at = now()
          WHERE organization_id = $1
            AND id = $2
        `,
        [campaign.organization_id, campaignId],
      );

      await client.query(
        `
          UPDATE campaign_runs
          SET
            status = 'paused',
            finished_at = COALESCE(finished_at, now()),
            updated_at = now()
          WHERE campaign_id = $1
            AND status = 'running'
        `,
        [campaignId],
      );
    });

    const worker = this.workers.get(campaignId);
    if (worker) {
      worker.running = false;
    }

    this.eventsGateway.emitCampaignUpdate({ id: campaignId, status: 'paused' });
    await this.emitCampaignStats(campaignId);
    return { message: 'Campaign paused' };
  }

  async stopCampaign(campaignId: string) {
    const campaign = await this.loadCampaignRuntimeState(campaignId);
    if (!campaign) {
      throw new Error('Campaign not found');
    }

    await this.databaseService.tx(async (client) => {
      await client.query(
        `
          UPDATE campaigns
          SET status = 'stopped', updated_at = now()
          WHERE organization_id = $1
            AND id = $2
        `,
        [campaign.organization_id, campaignId],
      );

      await client.query(
        `
          UPDATE campaign_runs
          SET
            status = 'stopped',
            finished_at = COALESCE(finished_at, now()),
            updated_at = now()
          WHERE campaign_id = $1
            AND status = 'running'
        `,
        [campaignId],
      );
    });

    const worker = this.workers.get(campaignId);
    if (worker) {
      worker.running = false;
    }

    this.eventsGateway.emitCampaignUpdate({ id: campaignId, status: 'stopped' });
    await this.emitCampaignStats(campaignId);
    return { message: 'Campaign stopped' };
  }

  private readonly onManagerEvent = (event: any) => {
    void this.handleManagerEvent(event).catch((error) => {
      this.logger.error(`AMI event handling failed: ${error.message}`);
    });
  };

  private async handleManagerEvent(rawEvent: Record<string, any>) {
    const event = this.normalizeManagerEvent(rawEvent);
    const eventName = event.event?.toLowerCase();

    if (eventName === 'userevent' && event.userevent?.toLowerCase() === 'cyberxdialer') {
      await this.handleDialerEvent(event, rawEvent);
      return;
    }

    if (eventName === 'originateresponse') {
      await this.handleOriginateResponse(event, rawEvent);
    }
  }

  private async handleDialerEvent(event: NormalizedManagerEvent, rawEvent: Record<string, any>) {
    const campaignId = String(event.campaignid || '').trim();
    const phoneNumber = normalizePhone(String(event.number || ''));
    const status = String(event.status || '').trim().toLowerCase();

    if (!campaignId || !phoneNumber || !status) {
      return;
    }

    const context = await this.findContextForCampaignEvent(campaignId, phoneNumber);
    if (!context) {
      return;
    }

    if (status === 'answered_dtmf' || status === 'no_dtmf') {
      await this.recordAnsweredState(context, status, String(event.dtmf || ''), rawEvent);
      return;
    }

    if (status === 'hangup') {
      const dispositionLower = context.terminalDisposition || 'no_dtmf';
      const dispositionUpper = this.mapDispositionUpper(dispositionLower);
      await this.finalizeCall(context, {
        dispositionLower,
        dispositionUpper,
        endedAt: new Date(),
        answeredAt: context.answeredAt,
        dtmf: context.dtmf,
        hangupSource: 'asterisk',
        rawPayload: rawEvent,
      });
    }
  }

  private async handleOriginateResponse(event: NormalizedManagerEvent, rawEvent: Record<string, any>) {
    const actionId = String(event.actionid || '').trim();
    if (!actionId) {
      return;
    }

    const response = String(event.response || '').trim().toLowerCase();
    const channel = String(event.channel || '').trim() || null;
    let context = this.activeCalls.get(actionId) || null;

    if (!context) {
      context = await this.findContextByActionId(actionId);
      if (context) {
        this.activeCalls.set(actionId, context);
      }
    }

    if (!context) {
      return;
    }

    if (channel) {
      context.asteriskChannel = channel;
      await this.databaseService.query(
        `
          UPDATE calls
          SET asterisk_channel = $2, updated_at = now()
          WHERE id = $1
        `,
        [context.callId, channel],
      );
    }

    if (response !== 'failure') {
      return;
    }

    const reasonCode = String(event.reason || '').trim();
    const dispositionLower = reasonCode === '17' ? 'busy' : reasonCode === '19' ? 'noanswer' : 'failed';
    const dispositionUpper = this.mapDispositionUpper(dispositionLower);

    await this.finalizeCall(context, {
      dispositionLower,
      dispositionUpper,
      endedAt: new Date(),
      dtmf: '',
      failureCode: reasonCode || null,
      failureReason: String(event.reasontext || event.message || 'Originate failure').trim() || null,
      hangupSource: 'asterisk',
      rawPayload: rawEvent,
    });

    this.eventsGateway.emitCallResult({
      campaignId: context.campaignId,
      phoneNumber: context.phoneNumber,
      dtmf: '',
      status: dispositionLower,
    });
  }

  private async recordAnsweredState(
    context: ActiveCallContext,
    status: 'answered_dtmf' | 'no_dtmf',
    dtmf: string,
    rawPayload: Record<string, any>,
  ) {
    const alreadyRecorded = Boolean(context.answeredAt) && context.terminalDisposition === status;
    if (alreadyRecorded) {
      return;
    }

    const answeredAt = context.answeredAt || new Date();
    context.answeredAt = answeredAt;
    context.terminalDisposition = status;
    context.dtmf = dtmf;

    await this.databaseService.tx(async (client) => {
      await client.query(
        `
          UPDATE calls
          SET
            status = 'answered',
            answered_at = COALESCE(answered_at, $2::timestamptz),
            updated_at = now()
          WHERE id = $1
        `,
        [context.callId, answeredAt.toISOString()],
      );

      await client.query(
        `
          UPDATE call_attempts
          SET
            status = 'answered',
            answered_at = COALESCE(answered_at, $2::timestamptz),
            updated_at = now()
          WHERE id = $1
        `,
        [context.callAttemptId, answeredAt.toISOString()],
      );

      await this.applyTargetOutcome(
        client,
        context,
        this.mapTargetStatus(status),
        this.mapDispositionUpper(status),
        dtmf,
        answeredAt,
      );

      await this.insertCallEvent(client, {
        organizationId: context.organizationId,
        callId: context.callId,
        callAttemptId: context.callAttemptId,
        eventType: 'answered',
        source: 'asterisk',
        payload: rawPayload,
        createdAt: answeredAt,
      });

      if (status === 'answered_dtmf' && dtmf) {
        await client.query(
          `
            INSERT INTO dtmf_events (
              organization_id,
              call_id,
              call_attempt_id,
              digit,
              raw_payload,
              received_at,
              created_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5::jsonb, $6::timestamptz, now(), now())
          `,
          [
            context.organizationId,
            context.callId,
            context.callAttemptId,
            dtmf,
            JSON.stringify(rawPayload || {}),
            answeredAt.toISOString(),
          ],
        );

        await this.insertCallEvent(client, {
          organizationId: context.organizationId,
          callId: context.callId,
          callAttemptId: context.callAttemptId,
          eventType: 'dtmf',
          source: 'asterisk',
          dtmfDigit: dtmf,
          payload: rawPayload,
          createdAt: answeredAt,
        });
      }
    });

    this.eventsGateway.emitCallResult({
      campaignId: context.campaignId,
      phoneNumber: context.phoneNumber,
      dtmf,
      status,
    });
    await this.emitCampaignStats(context.campaignId);
  }

  private async finalizeCall(context: ActiveCallContext, outcome: TerminalOutcome) {
    const endedAt = outcome.endedAt || new Date();
    const answeredAt = outcome.answeredAt ?? context.answeredAt;
    const startedAt = context.startedAt || endedAt;
    const totalDurationMs = Math.max(0, endedAt.getTime() - startedAt.getTime());
    const talkDurationMs = answeredAt ? Math.max(0, endedAt.getTime() - answeredAt.getTime()) : 0;
    const ringDurationMs = answeredAt ? Math.max(0, answeredAt.getTime() - startedAt.getTime()) : totalDurationMs;
    const callStatus = this.mapCallStatus(outcome.dispositionLower);
    const dtmf = outcome.dtmf ?? context.dtmf;

    await this.databaseService.tx(async (client) => {
      await client.query(
        `
          UPDATE calls
          SET
            status = $2,
            answered_at = COALESCE($3::timestamptz, answered_at),
            ended_at = $4::timestamptz,
            hangup_cause = $5,
            hangup_source = $6,
            updated_at = now()
          WHERE id = $1
        `,
        [
          context.callId,
          callStatus,
          answeredAt ? answeredAt.toISOString() : null,
          endedAt.toISOString(),
          outcome.dispositionUpper,
          outcome.hangupSource,
        ],
      );

      await client.query(
        `
          UPDATE call_attempts
          SET
            status = $2,
            answered_at = COALESCE($3::timestamptz, answered_at),
            ended_at = $4::timestamptz,
            ring_duration_ms = $5,
            talk_duration_ms = $6,
            bill_duration_ms = $7,
            hangup_cause = $8,
            hangup_source = $9,
            failure_code = $10,
            failure_reason = $11,
            updated_at = now()
          WHERE id = $1
        `,
        [
          context.callAttemptId,
          callStatus,
          answeredAt ? answeredAt.toISOString() : null,
          endedAt.toISOString(),
          ringDurationMs,
          talkDurationMs,
          talkDurationMs,
          outcome.dispositionUpper,
          outcome.hangupSource,
          outcome.failureCode || null,
          outcome.failureReason || null,
        ],
      );

      await this.applyTargetOutcome(
        client,
        context,
        this.mapTargetStatus(outcome.dispositionLower),
        outcome.dispositionUpper,
        dtmf,
        endedAt,
      );

      await this.upsertCdr(client, context, {
        dispositionLower: outcome.dispositionLower,
        dispositionUpper: outcome.dispositionUpper,
        answeredAt,
        endedAt,
        ringDurationMs,
        talkDurationMs,
        totalDurationMs,
        dtmf,
        rawPayload: outcome.rawPayload || {},
      });

      await this.insertCallEvent(client, {
        organizationId: context.organizationId,
        callId: context.callId,
        callAttemptId: context.callAttemptId,
        eventType: callStatus === 'failed' ? 'failed' : 'completed',
        source: outcome.hangupSource === 'system' ? 'system' : 'asterisk',
        payload: outcome.rawPayload || {},
        createdAt: endedAt,
      });

      await this.insertCallEvent(client, {
        organizationId: context.organizationId,
        callId: context.callId,
        callAttemptId: context.callAttemptId,
        eventType: 'hangup',
        source: outcome.hangupSource === 'system' ? 'system' : 'asterisk',
        payload: outcome.rawPayload || {},
        createdAt: endedAt,
      });
    });

    this.activeCalls.delete(context.actionId);
    this.eventsGateway.emitCallHangup({
      campaignId: context.campaignId,
      phoneNumber: context.phoneNumber,
    });
    await this.emitCampaignStats(context.campaignId);
    await this.completeCampaignIfDone(context.campaignId);
  }

  private ensureWorkerRunning(campaignId: string, runId: string | null) {
    const existing = this.workers.get(campaignId);
    if (existing?.running) {
      if (!existing.runId && runId) {
        existing.runId = runId;
      }
      return;
    }

    const worker: CampaignWorker = {
      campaignId,
      runId,
      running: true,
    };

    worker.loopPromise = this.runDialerLoop(worker).finally(() => {
      const current = this.workers.get(campaignId);
      if (current === worker) {
        this.workers.delete(campaignId);
      }
    });

    this.workers.set(campaignId, worker);
  }

  private async runDialerLoop(worker: CampaignWorker) {
    while (worker.running) {
      const campaign = await this.loadCampaignRuntimeState(worker.campaignId);
      if (!campaign || campaign.status !== 'running') {
        worker.running = false;
        break;
      }

      if (!worker.runId) {
        worker.runId = campaign.current_run_id || null;
      }

      const activeForCampaign = this.getActiveCallCount(worker.campaignId);
      const maxConcurrentCalls = Math.max(1, Number(campaign.max_concurrent_calls || 1));

      if (activeForCampaign < maxConcurrentCalls) {
        const slotsAvailable = maxConcurrentCalls - activeForCampaign;
        const targets = await this.claimPendingTargets(worker.campaignId, slotsAvailable);

        if (targets.length === 0 && activeForCampaign === 0) {
          const completed = await this.completeCampaignIfDone(worker.campaignId);
          if (completed) {
            worker.running = false;
            break;
          }
        }

        for (const target of targets) {
          void this.fireCall(campaign, worker, target).catch((error) => {
            this.logger.error(`Call error for ${target.phone_e164}: ${error.message}`);
          });
        }
      }

      await this.sleep(600);
    }
  }

  private async fireCall(campaign: CampaignRuntimeState, worker: CampaignWorker, target: ClaimedTarget) {
    const audioPath = this.resolveAudioPath(campaign);
    if (!audioPath) {
      throw new Error(`Campaign ${campaign.id} is missing an audio path`);
    }

    if (!campaign.sip_username || !campaign.sip_trunk_id) {
      throw new Error(`Campaign ${campaign.id} is missing a SIP trunk`);
    }

    const actionId = randomUUID();
    const callId = randomUUID();
    const callAttemptId = randomUUID();
    const startedAt = new Date();
    const callerId = campaign.caller_id_number
      ? `${campaign.caller_id_number} <${campaign.caller_id_number}>`
      : `${campaign.sip_username} <${campaign.sip_username}>`;

    await this.databaseService.tx(async (client) => {
      await client.query(
        `
          INSERT INTO calls (
            id,
            organization_id,
            campaign_id,
            campaign_run_id,
            campaign_target_id,
            contact_id,
            direction,
            status,
            to_number_e164,
            from_number_e164,
            sip_trunk_id,
            caller_id_id,
            provider_call_ref,
            record_calls,
            metadata,
            started_at,
            created_at,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, 'outbound', 'dialing', $7, $8, $9, $10, $11,
            false, $12::jsonb, $13::timestamptz, now(), now()
          )
        `,
        [
          callId,
          campaign.organization_id,
          campaign.id,
          worker.runId,
          target.id,
          target.contact_id,
          target.phone_e164,
          campaign.caller_id_number || null,
          campaign.sip_trunk_id,
          campaign.caller_id_id,
          actionId,
          JSON.stringify({
            source: 'campaign-runtime',
            actionId,
            audioPath,
          }),
          startedAt.toISOString(),
        ],
      );

      await client.query(
        `
          INSERT INTO call_attempts (
            id,
            organization_id,
            call_id,
            attempt_number,
            sip_trunk_id,
            caller_id_id,
            status,
            provider_attempt_ref,
            started_at,
            created_at,
            updated_at
          )
          VALUES (
            $1, $2, $3, $4, $5, $6, 'dialing', $7, $8::timestamptz, now(), now()
          )
        `,
        [
          callAttemptId,
          campaign.organization_id,
          callId,
          Math.max(1, Number(target.attempts_made || 1)),
          campaign.sip_trunk_id,
          campaign.caller_id_id,
          actionId,
          startedAt.toISOString(),
        ],
      );

      await this.insertCallEvent(client, {
        organizationId: campaign.organization_id,
        callId,
        callAttemptId,
        eventType: 'dialing',
        source: 'worker',
        payload: {
          actionId,
          phoneNumber: target.phone_e164,
          campaignId: campaign.id,
        },
        createdAt: startedAt,
      });
    });

    const context: ActiveCallContext = {
      actionId,
      organizationId: campaign.organization_id,
      campaignId: campaign.id,
      campaignRunId: worker.runId,
      campaignTargetId: target.id,
      contactId: target.contact_id,
      phoneNumber: target.phone_e164,
      sipTrunkId: campaign.sip_trunk_id,
      callerIdId: campaign.caller_id_id,
      sipUsername: campaign.sip_username,
      callerIdNumber: campaign.caller_id_number,
      callId,
      callAttemptId,
      startedAt,
      answeredAt: null,
      terminalDisposition: null,
      dtmf: '',
      asteriskChannel: null,
    };

    this.activeCalls.set(actionId, context);

    try {
      await this.telephonyService.originateCall({
        channel: `SIP/${campaign.sip_username}/${target.phone_e164}`,
        callerId,
        timeout: 30000,
        actionId,
        variables: {
          CAMPAIGN_ID: campaign.id,
          SIP_USER: campaign.sip_username,
          ORIGINAL_NUMBER: target.phone_e164,
          AUDIO_FILE: audioPath,
          DTMF_MAX_DIGITS: String(Math.max(1, Number(campaign.dtmf_digits || 1))),
        },
      });

      this.logger.log(`Originated call to ${target.phone_e164} for campaign ${campaign.id}`);
      this.eventsGateway.emitCallStarted({
        campaignId: campaign.id,
        phoneNumber: target.phone_e164,
      });
    } catch (error: any) {
      await this.finalizeCall(context, {
        dispositionLower: 'failed',
        dispositionUpper: 'FAILED',
        endedAt: new Date(),
        failureReason: error.message,
        hangupSource: 'system',
        rawPayload: {
          error: error.message,
          stage: 'originate-submission',
        },
      });

      this.eventsGateway.emitCallResult({
        campaignId: campaign.id,
        phoneNumber: target.phone_e164,
        dtmf: '',
        status: 'failed',
      });
    }
  }

  private async claimPendingTargets(campaignId: string, limit: number) {
    return this.databaseService.tx(async (client) => {
      const result = await client.query<ClaimedTarget>(
        `
          WITH picked AS (
            SELECT id
            FROM campaign_targets
            WHERE organization_id = $1
              AND campaign_id = $2
              AND status = 'pending'
              AND (next_attempt_at IS NULL OR next_attempt_at <= now())
            ORDER BY priority ASC, created_at ASC
            LIMIT $3
            FOR UPDATE SKIP LOCKED
          )
          UPDATE campaign_targets ct
          SET
            status = 'dialing',
            attempts_made = ct.attempts_made + 1,
            last_attempt_at = now(),
            updated_at = now()
          FROM picked
          WHERE ct.id = picked.id
          RETURNING ct.id, ct.contact_id, ct.phone_e164, ct.display_name, ct.attempts_made
        `,
        [this.appContextService.getOrganizationId(), campaignId, Math.max(1, limit)],
      );

      return result.rows;
    });
  }

  private async emitCampaignStats(campaignId: string) {
    const row = await this.databaseService.one<any>(
      `
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
          COUNT(*) FILTER (WHERE status = 'dialing')::int AS calling,
          COUNT(*) FILTER (WHERE status = 'answered')::int AS answered,
          COUNT(*) FILTER (WHERE last_disposition = 'NO_DTMF')::int AS no_dtmf,
          COUNT(*) FILTER (WHERE last_disposition = 'BUSY')::int AS busy,
          COUNT(*) FILTER (WHERE last_disposition = 'NOANSWER')::int AS noanswer,
          COUNT(*) FILTER (
            WHERE last_disposition = 'FAILED'
               OR (status = 'failed' AND last_disposition IS NULL)
          )::int AS failed
        FROM campaign_targets
        WHERE campaign_id = $1
      `,
      [campaignId],
    );

    const stats = {
      pending: Number(row?.pending || 0),
      calling: Number(row?.calling || 0),
      answered: Number(row?.answered || 0),
      no_dtmf: Number(row?.no_dtmf || 0),
      busy: Number(row?.busy || 0),
      noanswer: Number(row?.noanswer || 0),
      failed: Number(row?.failed || 0),
    };

    this.eventsGateway.emitCampaignStats({ id: campaignId, ...stats });

    await this.databaseService.query(
      `
        UPDATE campaign_runs
        SET summary = $2::jsonb, updated_at = now()
        WHERE campaign_id = $1
          AND status = 'running'
      `,
      [campaignId, JSON.stringify(stats)],
    );
  }

  private async completeCampaignIfDone(campaignId: string) {
    const row = await this.databaseService.one<any>(
      `
        SELECT
          c.status,
          COUNT(ct.id) FILTER (WHERE ct.status IN ('pending', 'dialing'))::int AS open_targets
        FROM campaigns c
        LEFT JOIN campaign_targets ct ON ct.campaign_id = c.id
        WHERE c.organization_id = $1
          AND c.id = $2
          AND c.deleted_at IS NULL
        GROUP BY c.id
      `,
      [this.appContextService.getOrganizationId(), campaignId],
    );

    if (!row || row.status !== 'running' || Number(row.open_targets || 0) > 0) {
      return false;
    }

    await this.databaseService.tx(async (client) => {
      await client.query(
        `
          UPDATE campaigns
          SET status = 'completed', updated_at = now()
          WHERE organization_id = $1
            AND id = $2
            AND status = 'running'
        `,
        [this.appContextService.getOrganizationId(), campaignId],
      );

      await client.query(
        `
          UPDATE campaign_runs
          SET
            status = 'completed',
            finished_at = COALESCE(finished_at, now()),
            updated_at = now()
          WHERE campaign_id = $1
            AND status = 'running'
        `,
        [campaignId],
      );
    });

    this.eventsGateway.emitCampaignUpdate({ id: campaignId, status: 'completed' });
    await this.emitCampaignStats(campaignId);
    this.logger.log(`Campaign ${campaignId} completed`);
    return true;
  }

  private async resetStaleRuntimeState() {
    const organizationId = this.appContextService.getOrganizationId();

    await this.databaseService.tx(async (client) => {
      await client.query(
        `
          UPDATE campaign_targets
          SET status = 'pending', updated_at = now()
          WHERE organization_id = $1
            AND status = 'dialing'
        `,
        [organizationId],
      );

      await client.query(
        `
          UPDATE campaigns
          SET status = 'paused', updated_at = now()
          WHERE organization_id = $1
            AND status = 'running'
        `,
        [organizationId],
      );

      await client.query(
        `
          UPDATE campaign_runs
          SET
            status = 'paused',
            finished_at = COALESCE(finished_at, now()),
            updated_at = now()
          WHERE organization_id = $1
            AND status = 'running'
        `,
        [organizationId],
      );

      await client.query(
        `
          UPDATE calls
          SET
            status = 'failed',
            ended_at = COALESCE(ended_at, now()),
            hangup_cause = COALESCE(hangup_cause, 'WORKER_RESTART'),
            hangup_source = COALESCE(hangup_source, 'system'),
            updated_at = now()
          WHERE organization_id = $1
            AND status IN ('queued', 'dialing', 'ringing')
        `,
        [organizationId],
      );

      await client.query(
        `
          UPDATE call_attempts
          SET
            status = 'failed',
            ended_at = COALESCE(ended_at, now()),
            hangup_cause = COALESCE(hangup_cause, 'WORKER_RESTART'),
            hangup_source = COALESCE(hangup_source, 'system'),
            failure_code = COALESCE(failure_code, 'WORKER_RESTART'),
            failure_reason = COALESCE(failure_reason, 'Dialer runtime restarted before a terminal AMI event was received'),
            updated_at = now()
          WHERE organization_id = $1
            AND status IN ('queued', 'dialing', 'ringing')
        `,
        [organizationId],
      );
    });
  }

  private async applyTargetOutcome(
    client: PoolClient,
    context: ActiveCallContext,
    targetStatus: string,
    lastDisposition: string,
    dtmf: string,
    calledAt: Date,
  ) {
    await client.query(
      `
        UPDATE campaign_targets
        SET
          status = $2,
          last_attempt_at = $3::timestamptz,
          last_disposition = $4,
          last_dtmf = NULLIF($5, ''),
          metadata = COALESCE(campaign_targets.metadata, '{}'::jsonb) || $6::jsonb,
          updated_at = now()
        WHERE id = $1
      `,
      [
        context.campaignTargetId,
        targetStatus,
        calledAt.toISOString(),
        lastDisposition,
        dtmf,
        JSON.stringify({
          last_action_id: context.actionId,
          last_call_id: context.callId,
        }),
      ],
    );

    if (!context.contactId) {
      return;
    }

    await client.query(
      `
        UPDATE contacts
        SET
          last_called_at = $2::timestamptz,
          attributes = COALESCE(contacts.attributes, '{}'::jsonb) || $3::jsonb,
          updated_at = now()
        WHERE id = $1
      `,
      [
        context.contactId,
        calledAt.toISOString(),
        JSON.stringify({
          dialer_status: this.mapDialerStatus(lastDisposition),
          last_result: String(lastDisposition || '').toLowerCase(),
          last_dtmf: dtmf || '',
        }),
      ],
    );
  }

  private async upsertCdr(
    client: PoolClient,
    context: ActiveCallContext,
    input: {
      dispositionLower: string;
      dispositionUpper: string;
      answeredAt: Date | null;
      endedAt: Date;
      ringDurationMs: number;
      talkDurationMs: number;
      totalDurationMs: number;
      dtmf: string;
      rawPayload: Record<string, any>;
    },
  ) {
    const existing = await client.query<{ id: string }>(
      `
        SELECT id
        FROM cdrs
        WHERE call_id = $1
        ORDER BY started_at DESC
        LIMIT 1
      `,
      [context.callId],
    );

    const dtmfSummary = input.dtmf ? { primary: input.dtmf } : {};
    const payload = {
      actionId: context.actionId,
      rawEvent: input.rawPayload || {},
    };

    if (existing.rows[0]) {
      await client.query(
        `
          UPDATE cdrs
          SET
            call_attempt_id = $2,
            campaign_id = $3,
            contact_id = $4,
            sip_trunk_id = $5,
            caller_id_id = $6,
            provider_name = 'asterisk-ami',
            provider_cdr_ref = $7,
            from_number_e164 = $8,
            to_number_e164 = $9,
            disposition = $10,
            hangup_cause = $11,
            hangup_disposition = $12,
            answered_at = $13::timestamptz,
            ended_at = $14::timestamptz,
            ring_duration_ms = $15,
            talk_duration_ms = $16,
            bill_duration_ms = $17,
            total_duration_ms = $18,
            dtmf_summary = $19::jsonb,
            raw_provider_payload = $20::jsonb,
            created_at = now()
          WHERE call_id = $1
        `,
        [
          context.callId,
          context.callAttemptId,
          context.campaignId,
          context.contactId,
          context.sipTrunkId,
          context.callerIdId,
          context.actionId,
          context.callerIdNumber,
          context.phoneNumber,
          input.dispositionLower,
          input.dispositionUpper,
          input.dispositionUpper,
          input.answeredAt ? input.answeredAt.toISOString() : null,
          input.endedAt.toISOString(),
          input.ringDurationMs,
          input.talkDurationMs,
          input.talkDurationMs,
          input.totalDurationMs,
          JSON.stringify(dtmfSummary),
          JSON.stringify(payload),
        ],
      );
      return;
    }

    await client.query(
      `
        INSERT INTO cdrs (
          started_at,
          id,
          organization_id,
          call_id,
          call_attempt_id,
          campaign_id,
          contact_id,
          sip_trunk_id,
          caller_id_id,
          direction,
          provider_name,
          provider_cdr_ref,
          from_number_e164,
          to_number_e164,
          disposition,
          hangup_cause,
          hangup_disposition,
          answered_at,
          ended_at,
          ring_duration_ms,
          talk_duration_ms,
          bill_duration_ms,
          total_duration_ms,
          dtmf_summary,
          raw_provider_payload,
          created_at
        )
        VALUES (
          $1::timestamptz,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          'outbound',
          'asterisk-ami',
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16::timestamptz,
          $17::timestamptz,
          $18,
          $19,
          $20,
          $21,
          $22::jsonb,
          $23::jsonb,
          now()
        )
      `,
      [
        context.startedAt.toISOString(),
        randomUUID(),
        context.organizationId,
        context.callId,
        context.callAttemptId,
        context.campaignId,
        context.contactId,
        context.sipTrunkId,
        context.callerIdId,
        context.actionId,
        context.callerIdNumber,
        context.phoneNumber,
        input.dispositionLower,
        input.dispositionUpper,
        input.dispositionUpper,
        input.answeredAt ? input.answeredAt.toISOString() : null,
        input.endedAt.toISOString(),
        input.ringDurationMs,
        input.talkDurationMs,
        input.talkDurationMs,
        input.totalDurationMs,
        JSON.stringify(dtmfSummary),
        JSON.stringify(payload),
      ],
    );
  }

  private async insertCallEvent(
    client: PoolClient,
    input: {
      organizationId: string;
      callId: string;
      callAttemptId?: string | null;
      eventType: string;
      source: string;
      dtmfDigit?: string;
      payload: Record<string, any>;
      createdAt?: Date;
    },
  ) {
    await client.query(
      `
        INSERT INTO call_events (
          organization_id,
          call_id,
          call_attempt_id,
          event_type,
          source,
          dtmf_digit,
          payload,
          created_at
        )
        VALUES (
          $1, $2, $3, $4, $5, NULLIF($6, ''), $7::jsonb, COALESCE($8::timestamptz, now())
        )
      `,
      [
        input.organizationId,
        input.callId,
        input.callAttemptId || null,
        input.eventType,
        input.source,
        input.dtmfDigit || '',
        JSON.stringify(input.payload || {}),
        input.createdAt ? input.createdAt.toISOString() : null,
      ],
    );
  }

  private async findContextForCampaignEvent(campaignId: string, phoneNumber: string) {
    for (const context of this.activeCalls.values()) {
      if (context.campaignId === campaignId && context.phoneNumber === phoneNumber) {
        return context;
      }
    }

    if (!this.isUuid(campaignId)) {
      return null;
    }

    return this.findOpenCallContext(
      `
        SELECT
          c.id AS call_id,
          c.organization_id,
          c.campaign_id,
          c.campaign_run_id,
          c.campaign_target_id,
          c.contact_id,
          c.to_number_e164 AS phone_number,
          c.sip_trunk_id,
          c.caller_id_id,
          c.provider_call_ref AS action_id,
          c.started_at,
          c.answered_at,
          c.asterisk_channel,
          ca.id AS call_attempt_id,
          st.username AS sip_username,
          COALESCE(cid.number_e164, '') AS caller_id_number
        FROM calls c
        LEFT JOIN LATERAL (
          SELECT id
          FROM call_attempts
          WHERE call_id = c.id
          ORDER BY attempt_number DESC
          LIMIT 1
        ) ca ON true
        LEFT JOIN sip_trunks st ON st.id = c.sip_trunk_id
        LEFT JOIN caller_ids cid ON cid.id = c.caller_id_id
        WHERE c.organization_id = $1
          AND c.campaign_id = $2::uuid
          AND c.to_number_e164 = $3
          AND c.status IN ('dialing', 'ringing', 'answered')
        ORDER BY c.created_at DESC
        LIMIT 1
      `,
      [this.appContextService.getOrganizationId(), campaignId, phoneNumber],
    );
  }

  private async findContextByActionId(actionId: string) {
    return this.findOpenCallContext(
      `
        SELECT
          c.id AS call_id,
          c.organization_id,
          c.campaign_id,
          c.campaign_run_id,
          c.campaign_target_id,
          c.contact_id,
          c.to_number_e164 AS phone_number,
          c.sip_trunk_id,
          c.caller_id_id,
          c.provider_call_ref AS action_id,
          c.started_at,
          c.answered_at,
          c.asterisk_channel,
          ca.id AS call_attempt_id,
          st.username AS sip_username,
          COALESCE(cid.number_e164, '') AS caller_id_number
        FROM calls c
        LEFT JOIN LATERAL (
          SELECT id
          FROM call_attempts
          WHERE call_id = c.id
          ORDER BY attempt_number DESC
          LIMIT 1
        ) ca ON true
        LEFT JOIN sip_trunks st ON st.id = c.sip_trunk_id
        LEFT JOIN caller_ids cid ON cid.id = c.caller_id_id
        WHERE c.organization_id = $1
          AND c.provider_call_ref = $2
          AND c.status IN ('dialing', 'ringing', 'answered')
        ORDER BY c.created_at DESC
        LIMIT 1
      `,
      [this.appContextService.getOrganizationId(), actionId],
    );
  }

  private async findOpenCallContext(query: string, params: any[]) {
    const row = await this.databaseService.one<any>(query, params);
    if (!row) {
      return null;
    }

    return {
      actionId: row.action_id,
      organizationId: row.organization_id,
      campaignId: row.campaign_id,
      campaignRunId: row.campaign_run_id,
      campaignTargetId: row.campaign_target_id,
      contactId: row.contact_id,
      phoneNumber: row.phone_number,
      sipTrunkId: row.sip_trunk_id,
      callerIdId: row.caller_id_id,
      sipUsername: row.sip_username,
      callerIdNumber: row.caller_id_number || null,
      callId: row.call_id,
      callAttemptId: row.call_attempt_id,
      startedAt: row.started_at ? new Date(row.started_at) : new Date(),
      answeredAt: row.answered_at ? new Date(row.answered_at) : null,
      terminalDisposition: null,
      dtmf: '',
      asteriskChannel: row.asterisk_channel || null,
    } as ActiveCallContext;
  }

  private async loadCampaignRuntimeState(campaignId: string) {
    const row = await this.databaseService.one<any>(
      `
        SELECT
          c.id,
          c.organization_id,
          c.status,
          c.max_concurrent_calls,
          COALESCE((c.metadata->>'legacy_dtmf_digits')::int, 1) AS dtmf_digits,
          c.sip_trunk_id,
          st.username AS sip_username,
          st.default_caller_id_id AS caller_id_id,
          COALESCE(cid.number_e164, '') AS caller_id_number,
          aa.storage_key AS audio_storage_key,
          COALESCE(aa.metadata->>'asteriskPath', '') AS audio_asterisk_path,
          c.metadata->>'legacy_audio_file' AS legacy_audio_file,
          cr.id AS current_run_id
        FROM campaigns c
        LEFT JOIN sip_trunks st
          ON st.id = c.sip_trunk_id
         AND st.deleted_at IS NULL
        LEFT JOIN caller_ids cid ON cid.id = st.default_caller_id_id
        LEFT JOIN audio_assets aa
          ON aa.id = c.audio_asset_id
         AND aa.deleted_at IS NULL
        LEFT JOIN LATERAL (
          SELECT id
          FROM campaign_runs
          WHERE campaign_id = c.id
            AND status = 'running'
          ORDER BY run_number DESC
          LIMIT 1
        ) cr ON true
        WHERE c.organization_id = $1
          AND c.id = $2
          AND c.deleted_at IS NULL
        LIMIT 1
      `,
      [this.appContextService.getOrganizationId(), campaignId],
    );

    if (!row) {
      return null;
    }

    return {
      ...row,
      max_concurrent_calls: Number(row.max_concurrent_calls || 1),
      dtmf_digits: Number(row.dtmf_digits || 1),
    } as CampaignRuntimeState;
  }

  private resolveAudioPath(campaign: CampaignRuntimeState) {
    const prefix = this.configService.get<string>(
      'ASTERISK_AUDIO_PREFIX',
      '/srv/var/lib/asterisk/sounds/custom_campaigns',
    );

    const explicitPath = String(campaign.audio_asterisk_path || '').trim();
    if (explicitPath) {
      return explicitPath;
    }

    const storageKey = String(campaign.audio_storage_key || '').trim();
    if (storageKey) {
      return `${prefix}/${basename(storageKey, extname(storageKey))}`;
    }

    const legacyFile = String(campaign.legacy_audio_file || '').trim();
    if (legacyFile) {
      return `${prefix}/${basename(legacyFile, extname(legacyFile))}`;
    }

    return '';
  }

  private getActiveCallCount(campaignId: string) {
    let count = 0;
    for (const context of this.activeCalls.values()) {
      if (context.campaignId === campaignId) {
        count += 1;
      }
    }
    return count;
  }

  private mapTargetStatus(disposition: string) {
    if (disposition === 'answered_dtmf') {
      return 'answered';
    }

    if (disposition === 'no_dtmf') {
      return 'completed';
    }

    if (disposition === 'busy' || disposition === 'noanswer' || disposition === 'failed') {
      return 'failed';
    }

    return disposition === 'answered' ? 'answered' : 'completed';
  }

  private mapCallStatus(disposition: string) {
    if (disposition === 'busy' || disposition === 'noanswer' || disposition === 'failed') {
      return 'failed';
    }

    return 'completed';
  }

  private mapDispositionUpper(disposition: string) {
    if (disposition === 'answered_dtmf') return 'ANSWERED_DTMF';
    if (disposition === 'no_dtmf') return 'NO_DTMF';
    if (disposition === 'busy') return 'BUSY';
    if (disposition === 'noanswer') return 'NOANSWER';
    if (disposition === 'answered') return 'ANSWERED';
    return 'FAILED';
  }

  private mapDialerStatus(lastDisposition: string) {
    const normalized = String(lastDisposition || '').trim().toUpperCase();
    if (normalized === 'ANSWERED_DTMF' || normalized === 'ANSWERED') {
      return 'answered';
    }

    if (normalized === 'NO_DTMF') {
      return 'no_dtmf';
    }

    if (normalized === 'BUSY') {
      return 'busy';
    }

    if (normalized === 'NOANSWER') {
      return 'noanswer';
    }

    return 'failed';
  }

  private normalizeManagerEvent(rawEvent: Record<string, any>) {
    const normalized: NormalizedManagerEvent = {};

    for (const [key, value] of Object.entries(rawEvent || {})) {
      normalized[key.toLowerCase()] = String(value ?? '');
    }

    return normalized;
  }

  private isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(value || ''),
    );
  }

  private async sleep(ms: number) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
