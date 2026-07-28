import { Injectable } from '@nestjs/common';
import { AuthProvider } from '../../../common/enums/auth-provider.enum';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { OAuthAccountRepository } from '../domain/oauth-account.repository';
import { toPrismaAuthProvider } from './auth-provider.mapper';

/** Prisma implementation of OAuthAccountRepository for `business_owner_oauth_accounts`. */
@Injectable()
export class BusinessOwnerOAuthAccountPrismaRepository implements OAuthAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAccountIdByProvider(
    provider: AuthProvider,
    providerAccountId: string,
  ): Promise<string | null> {
    const row = await this.prisma.businessOwnerOAuthAccount.findUnique({
      where: {
        provider_providerAccountId: { provider: toPrismaAuthProvider(provider), providerAccountId },
      },
      select: { businessOwnerId: true },
    });
    return row === null ? null : row.businessOwnerId;
  }

  async link(accountId: string, provider: AuthProvider, providerAccountId: string): Promise<void> {
    await this.prisma.businessOwnerOAuthAccount.create({
      data: {
        businessOwnerId: accountId,
        provider: toPrismaAuthProvider(provider),
        providerAccountId,
      },
    });
  }
}
