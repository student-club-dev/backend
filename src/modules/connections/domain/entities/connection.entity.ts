import { ConnectionStatus } from '../enums/connection-status.enum';

/** A connection edge between two students (LinkedIn-style; symmetric once ACCEPTED). */
export interface Connection {
  id: string;
  requesterId: string;
  addresseeId: string;
  status: ConnectionStatus;
  createdAt: Date;
  respondedAt: Date | null;
}
