import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/database/prisma.service';
import { SuggestRepository } from '../domain/suggest.repository';
import { Suggestion, SuggestQuery } from '../domain/suggestion.model';
import { suggestCandidates } from './suggest.sql';

/**
 * Prisma implementation of the suggest port. The SQL lives in `suggest.sql.ts` and already returns
 * the domain shape (camelCase aliases, `count::int`), so there is nothing to map here.
 */
@Injectable()
export class SuggestPrismaRepository implements SuggestRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCandidates(query: SuggestQuery): Promise<Suggestion[]> {
    // Without a type there is nothing to scope to, and `Prisma.join` rejects an empty list anyway.
    if (query.types.length === 0) {
      return [];
    }
    return this.prisma.$queryRaw<Suggestion[]>(suggestCandidates(query));
  }
}
