import { AuthProvider as PrismaAuthProvider } from '@prisma/client';
import { AuthProvider } from '../../../common/enums/auth-provider.enum';

/** Maps the domain AuthProvider to the Prisma enum. Values are identical; the map keeps types honest. */
const TO_PRISMA: Record<AuthProvider, PrismaAuthProvider> = {
  [AuthProvider.GOOGLE]: PrismaAuthProvider.GOOGLE,
  [AuthProvider.APPLE]: PrismaAuthProvider.APPLE,
};

export function toPrismaAuthProvider(provider: AuthProvider): PrismaAuthProvider {
  return TO_PRISMA[provider];
}
