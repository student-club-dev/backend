import { Injectable } from '@nestjs/common';
import { AuthProvider } from '../../../common/enums/auth-provider.enum';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { OAuthAccountRepository } from '../domain/oauth-account.repository';
import { toPrismaAuthProvider } from './auth-provider.mapper';

/** Prisma implementation of OAuthAccountRepository for `student_oauth_accounts`. Prisma is used ONLY here. */
@Injectable()
export class StudentOAuthAccountPrismaRepository implements OAuthAccountRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAccountIdByProvider(
    provider: AuthProvider,
    providerAccountId: string,
  ): Promise<string | null> {
    const row = await this.prisma.studentOAuthAccount.findUnique({
      where: {
        provider_providerAccountId: { provider: toPrismaAuthProvider(provider), providerAccountId },
      },
      select: { studentId: true },
    });
    return row === null ? null : row.studentId;
  }

  async link(accountId: string, provider: AuthProvider, providerAccountId: string): Promise<void> {
    await this.prisma.studentOAuthAccount.create({
      data: { studentId: accountId, provider: toPrismaAuthProvider(provider), providerAccountId },
    });
  }
}
