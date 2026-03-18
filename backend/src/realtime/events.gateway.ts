import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: { origin: '*' },
  transports: ['websocket', 'polling'],
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  emitCampaignUpdate(payload: Record<string, any>) {
    this.server.emit('campaign:update', payload);
  }

  emitCampaignStats(payload: Record<string, any>) {
    this.server.emit('campaign:stats', payload);
  }

  emitCallStarted(payload: Record<string, any>) {
    this.server.emit('call:started', payload);
  }

  emitCallHangup(payload: Record<string, any>) {
    this.server.emit('call:hangup', payload);
  }

  emitCallResult(payload: Record<string, any>) {
    this.server.emit('call:result', payload);
  }
}
