import { StudentSummary } from '../domain/entities/student-summary.entity';
import { ConnectionView } from '../domain/enums/connection-view.enum';

/** A page of application results plus the unpaginated total (the controller derives `hasNext`). */
export interface Page<T> {
  items: T[];
  total: number;
}

/** A discovery-search hit: the student plus the viewer's relationship to them (C11). */
export interface SearchResult {
  student: StudentSummary;
  view: ConnectionView;
}

/** An accepted connection, from the viewer's side: the other student + when it was accepted. */
export interface ConnectionListItem {
  student: StudentSummary;
  connectedAt: Date;
}

/** A pending request: the edge id (to accept/decline) + the other student + when it was sent. */
export interface RequestListItem {
  connectionId: string;
  student: StudentSummary;
  createdAt: Date;
}
