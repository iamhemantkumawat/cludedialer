import { Injectable } from '@nestjs/common';

@Injectable()
export class AppContextService {
  private organizationId = '';
  private bootstrapUserId = '';

  setOrganizationId(id: string) {
    this.organizationId = id;
  }

  getOrganizationId() {
    if (!this.organizationId) {
      throw new Error('Bootstrap organization has not been initialized yet.');
    }
    return this.organizationId;
  }

  setBootstrapUserId(id: string) {
    this.bootstrapUserId = id;
  }

  getBootstrapUserId() {
    if (!this.bootstrapUserId) {
      throw new Error('Bootstrap user has not been initialized yet.');
    }
    return this.bootstrapUserId;
  }
}
