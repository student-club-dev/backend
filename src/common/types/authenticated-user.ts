import { AccountType } from '../enums/account-type.enum';

/** Access-token payload (D2). `sub` is the account id; `type` selects the account table. */
export interface JwtPayload {
  sub: string;
  type: AccountType;
}

/** The authenticated principal placed on `req.user` by the JwtAuthGuard. */
export interface AuthenticatedUser {
  id: string;
  type: AccountType;
}
