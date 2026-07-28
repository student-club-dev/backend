import { AccountStatus } from '../domain/enums/account-status.enum';
import { Account } from '../domain/entities/account.entity';

/**
 * Common auth subset shared by the Student and BusinessOwner Prisma rows. `status` is the Prisma
 * `StudentStatus` / `BusinessOwnerStatus` value — both carry the same wire values as {@link AccountStatus}.
 */
interface AccountRow {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  phoneVerified: boolean;
  passwordHash: string | null;
  status: keyof typeof AccountStatus;
}

/** Maps a Student / BusinessOwner Prisma row to the auth Account domain type. */
export function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    email: row.email,
    phoneNumber: row.phoneNumber,
    phoneVerified: row.phoneVerified,
    passwordHash: row.passwordHash,
    status: AccountStatus[row.status],
  };
}
