import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, PoolClient, QueryResult } from 'pg';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool!: Pool;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    const databaseUrl = this.configService.get<string>('DATABASE_URL');

    this.pool = databaseUrl
      ? new Pool({ connectionString: databaseUrl })
      : new Pool({
          host: this.configService.get<string>('PGHOST', 'localhost'),
          port: Number(this.configService.get<string>('PGPORT', '5432')),
          database: this.configService.get<string>('PGDATABASE', 'cludedialer_portal'),
          user: this.configService.get<string>('PGUSER'),
          password: this.configService.get<string>('PGPASSWORD'),
        });

    await this.pool.query('SELECT 1');
    this.logger.log('Connected to PostgreSQL');
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
    }
  }

  async query<T = any>(text: string, params: any[] = []): Promise<QueryResult<T>> {
    return this.pool.query<T>(text, params);
  }

  async one<T = any>(text: string, params: any[] = []): Promise<T | null> {
    const result = await this.query<T>(text, params);
    return result.rows[0] ?? null;
  }

  async many<T = any>(text: string, params: any[] = []): Promise<T[]> {
    const result = await this.query<T>(text, params);
    return result.rows;
  }

  async connect(): Promise<PoolClient> {
    return this.pool.connect();
  }

  async tx<T>(handler: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.connect();
    try {
      await client.query('BEGIN');
      const result = await handler(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}
