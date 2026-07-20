import { Account } from '../domain/entities/account.entity';

/** Common auth subset shared by the Student and BusinessOwner Prisma rows. */
interface AccountRow {
  id: string;
  email: string | null;
  phoneNumber: string | null;
  passwordHash: string | null;
}

/** Maps a Student / BusinessOwner Prisma row to the auth Account domain type. */
export function toAccount(row: AccountRow): Account {
  return {
    id: row.id,
    email: row.email,
    phoneNumber: row.phoneNumber,
    passwordHash: row.passwordHash,
  };
}
