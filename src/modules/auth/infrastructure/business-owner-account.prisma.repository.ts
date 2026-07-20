import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { AccountRepository } from '../domain/account.repository';
import {
  Account,
  CreateAccountData,
  CreateOAuthAccountData,
} from '../domain/entities/account.entity';
import { toAccount } from './account.mapper';

/** Prisma implementation of AccountRepository for the `business_owners` table. */
@Injectable()
export class BusinessOwnerAccountPrismaRepository implements AccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<Account | null> {
    const row = await this.prisma.businessOwner.findUnique({ where: { email } });
    return row === null ? null : toAccount(row);
  }

  async findByPhone(phoneNumber: string): Promise<Account | null> {
    const row = await this.prisma.businessOwner.findUnique({ where: { phoneNumber } });
    return row === null ? null : toAccount(row);
  }

  async findById(id: string): Promise<Account | null> {
    const row = await this.prisma.businessOwner.findUnique({ where: { id } });
    return row === null ? null : toAccount(row);
  }

  async create(data: CreateAccountData): Promise<Account> {
    const row = await this.prisma.businessOwner.create({
      data: {
        email: data.email,
        phoneNumber: data.phoneNumber,
        passwordHash: data.passwordHash,
      },
    });
    return toAccount(row);
  }

  async createFromOAuth(data: CreateOAuthAccountData): Promise<Account> {
    const row = await this.prisma.businessOwner.create({
      data: {
        email: data.email,
        emailVerified: data.emailVerified,
        firstName: data.firstName,
        lastName: data.lastName,
        avatarUrl: data.avatarUrl,
      },
    });
    return toAccount(row);
  }

  async markPhoneVerified(accountId: string, phoneNumber: string): Promise<void> {
    await this.prisma.businessOwner.update({
      where: { id: accountId },
      data: { phoneNumber, phoneVerified: true },
    });
  }
}
