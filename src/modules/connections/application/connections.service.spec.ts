import { AccountType } from '../../../common/enums/account-type.enum';
import { ERROR_CODE } from '../../../common/errors/error-code';
import type { AuthenticatedUser } from '../../../common/types/authenticated-user';
import { PresenceRepository } from '../../../infrastructure/presence/presence.repository';
import { LastSeenVisibility } from '../../profiles/domain/enums/last-seen-visibility.enum';
import { ConnectionsRepository } from '../domain/connections.repository';
import { Connection } from '../domain/entities/connection.entity';
import { StudentSummary } from '../domain/entities/student-summary.entity';
import { ConnectionStatus } from '../domain/enums/connection-status.enum';
import { ConnectionView } from '../domain/enums/connection-view.enum';
import { StudentDirectoryRepository, StudentSort } from '../domain/student-directory.repository';
import { StudentListQuery } from './connections.io';
import { ConnectionsService } from './connections.service';

const me: AuthenticatedUser = { id: 'me', type: AccountType.STUDENT };

function edge(overrides: Partial<Connection> = {}): Connection {
  return {
    id: 'c1',
    requesterId: 'me',
    addresseeId: 'other',
    status: ConnectionStatus.PENDING,
    createdAt: new Date('2026-07-01T00:00:00Z'),
    respondedAt: null,
    ...overrides,
  };
}

function summary(id: string, overrides: Partial<StudentSummary> = {}): StudentSummary {
  return {
    id,
    username: id,
    fullName: id,
    avatarUrl: null,
    universityId: null,
    gender: null,
    courseYear: null,
    online: false,
    lastSeenAt: null,
    lastSeenVisibility: LastSeenVisibility.CONNECTIONS,
    ...overrides,
  };
}

/** An unfiltered list query — individual tests override just the field they exercise. */
function listQuery(overrides: Partial<StudentListQuery> = {}): StudentListQuery {
  return {
    q: null,
    universityIds: [],
    genders: [],
    courseYears: [],
    birthYearFrom: null,
    birthYearTo: null,
    sort: StudentSort.RECENT,
    connectionStatus: null,
    ...overrides,
  };
}

function makeConnections(overrides: Partial<ConnectionsRepository> = {}): ConnectionsRepository {
  return {
    findEdge: jest.fn().mockResolvedValue(null),
    findEdges: jest.fn().mockResolvedValue([]),
    idsByView: jest.fn().mockResolvedValue([]),
    findById: jest.fn().mockResolvedValue(null),
    create: jest.fn(async (requesterId: string, addresseeId: string) =>
      edge({ id: 'new', requesterId, addresseeId, status: ConnectionStatus.PENDING }),
    ),
    setStatus: jest.fn(async (id: string, status: ConnectionStatus) => edge({ id, status })),
    deleteEdge: jest.fn().mockResolvedValue(undefined),
    listAccepted: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    listPending: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    isBlockedEitherWay: jest.fn().mockResolvedValue(false),
    block: jest.fn().mockResolvedValue(undefined),
    unblock: jest.fn().mockResolvedValue(undefined),
    blockedIds: jest.fn().mockResolvedValue([]),
    ...overrides,
  };
}

function makeDirectory(
  overrides: Partial<StudentDirectoryRepository> = {},
): StudentDirectoryRepository {
  return {
    exists: jest.fn().mockResolvedValue(true),
    findSummary: jest.fn().mockResolvedValue(null),
    findSummaries: jest.fn().mockResolvedValue([]),
    list: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    ...overrides,
  };
}

function makePresence(overrides: Partial<PresenceRepository> = {}): PresenceRepository {
  return {
    online: jest.fn().mockResolvedValue(undefined),
    offline: jest.fn().mockResolvedValue(true),
    isOnline: jest.fn().mockResolvedValue(false),
    onlineAmong: jest.fn().mockResolvedValue(new Set<string>()),
    ...overrides,
  };
}

function makeService(
  connections: ConnectionsRepository = makeConnections(),
  directory: StudentDirectoryRepository = makeDirectory(),
  presence: PresenceRepository = makePresence(),
): ConnectionsService {
  return new ConnectionsService(connections, directory, presence);
}

describe('ConnectionsService', () => {
  describe('sendRequest', () => {
    it('throws 422 CANNOT_CONNECT_SELF for a self request', async () => {
      await expect(makeService().sendRequest(me, 'me')).rejects.toMatchObject({
        code: ERROR_CODE.CANNOT_CONNECT_SELF,
        status: 422,
      });
    });

    it('throws 404 STUDENT_NOT_FOUND for an unknown addressee', async () => {
      const service = makeService(
        makeConnections(),
        makeDirectory({ exists: jest.fn().mockResolvedValue(false) }),
      );
      await expect(service.sendRequest(me, 'ghost')).rejects.toMatchObject({
        code: ERROR_CODE.STUDENT_NOT_FOUND,
        status: 404,
      });
    });

    it('throws 403 USER_BLOCKED when either side has blocked', async () => {
      const service = makeService(
        makeConnections({ isBlockedEitherWay: jest.fn().mockResolvedValue(true) }),
      );
      await expect(service.sendRequest(me, 'other')).rejects.toMatchObject({
        code: ERROR_CODE.USER_BLOCKED,
        status: 403,
      });
    });

    it('creates a PENDING request when no edge exists', async () => {
      const connections = makeConnections();
      const result = await makeService(connections).sendRequest(me, 'other');
      expect(connections.create).toHaveBeenCalledWith('me', 'other');
      expect(result.status).toBe(ConnectionStatus.PENDING);
    });

    it('throws 409 ALREADY_CONNECTED when an accepted edge exists', async () => {
      const connections = makeConnections({
        findEdge: jest.fn().mockResolvedValue(edge({ status: ConnectionStatus.ACCEPTED })),
      });
      await expect(makeService(connections).sendRequest(me, 'other')).rejects.toMatchObject({
        code: ERROR_CODE.ALREADY_CONNECTED,
        status: 409,
      });
    });

    it('throws 409 CONNECTION_REQUEST_EXISTS when the caller already has a pending request', async () => {
      const connections = makeConnections({
        findEdge: jest
          .fn()
          .mockResolvedValue(
            edge({ requesterId: 'me', addresseeId: 'other', status: ConnectionStatus.PENDING }),
          ),
      });
      await expect(makeService(connections).sendRequest(me, 'other')).rejects.toMatchObject({
        code: ERROR_CODE.CONNECTION_REQUEST_EXISTS,
        status: 409,
      });
    });

    it('auto-accepts a reverse pending request (C1)', async () => {
      const connections = makeConnections({
        findEdge: jest.fn().mockResolvedValue(
          edge({
            id: 'rev',
            requesterId: 'other',
            addresseeId: 'me',
            status: ConnectionStatus.PENDING,
          }),
        ),
      });
      const result = await makeService(connections).sendRequest(me, 'other');
      expect(connections.setStatus).toHaveBeenCalledWith('rev', ConnectionStatus.ACCEPTED);
      expect(connections.create).not.toHaveBeenCalled();
      expect(result.status).toBe(ConnectionStatus.ACCEPTED);
    });

    it('clears a prior DECLINED edge then creates a fresh request once the cooldown has passed', async () => {
      const connections = makeConnections({
        findEdge: jest.fn().mockResolvedValue(
          edge({
            status: ConnectionStatus.DECLINED,
            respondedAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25h ago — past cooldown
          }),
        ),
      });
      await makeService(connections).sendRequest(me, 'other');
      expect(connections.deleteEdge).toHaveBeenCalledWith('me', 'other');
      expect(connections.create).toHaveBeenCalledWith('me', 'other');
    });

    it('throws 429 RATE_LIMITED when re-requesting within the decline cooldown (C10)', async () => {
      const connections = makeConnections({
        findEdge: jest.fn().mockResolvedValue(
          edge({
            status: ConnectionStatus.DECLINED,
            respondedAt: new Date(Date.now() - 60 * 60 * 1000), // 1h ago — inside cooldown
          }),
        ),
      });
      await expect(makeService(connections).sendRequest(me, 'other')).rejects.toMatchObject({
        code: ERROR_CODE.RATE_LIMITED,
        status: 429,
      });
      expect(connections.create).not.toHaveBeenCalled();
    });
  });

  describe('accept / decline', () => {
    const incoming = edge({
      id: 'req',
      requesterId: 'other',
      addresseeId: 'me',
      status: ConnectionStatus.PENDING,
    });

    it('accept: 404 when the request is not an incoming pending one', async () => {
      const connections = makeConnections({ findById: jest.fn().mockResolvedValue(null) });
      await expect(makeService(connections).accept(me, 'req')).rejects.toMatchObject({
        code: ERROR_CODE.CONNECTION_REQUEST_NOT_FOUND,
        status: 404,
      });
    });

    it('accept: 404 when the caller is the requester, not the addressee', async () => {
      const connections = makeConnections({
        findById: jest
          .fn()
          .mockResolvedValue(edge({ id: 'req', requesterId: 'me', addresseeId: 'other' })),
      });
      await expect(makeService(connections).accept(me, 'req')).rejects.toMatchObject({
        code: ERROR_CODE.CONNECTION_REQUEST_NOT_FOUND,
      });
    });

    it('accept: sets ACCEPTED for an incoming pending request', async () => {
      const connections = makeConnections({ findById: jest.fn().mockResolvedValue(incoming) });
      await makeService(connections).accept(me, 'req');
      expect(connections.setStatus).toHaveBeenCalledWith('req', ConnectionStatus.ACCEPTED);
    });

    it('decline: sets DECLINED for an incoming pending request', async () => {
      const connections = makeConnections({ findById: jest.fn().mockResolvedValue(incoming) });
      await makeService(connections).decline(me, 'req');
      expect(connections.setStatus).toHaveBeenCalledWith('req', ConnectionStatus.DECLINED);
    });
  });

  describe('remove', () => {
    it('throws 404 CONNECTION_NOT_FOUND when no accepted edge exists', async () => {
      const connections = makeConnections({ findEdge: jest.fn().mockResolvedValue(null) });
      await expect(makeService(connections).remove(me, 'other')).rejects.toMatchObject({
        code: ERROR_CODE.CONNECTION_NOT_FOUND,
        status: 404,
      });
    });

    it('deletes the edge for an accepted connection', async () => {
      const connections = makeConnections({
        findEdge: jest.fn().mockResolvedValue(edge({ status: ConnectionStatus.ACCEPTED })),
      });
      await makeService(connections).remove(me, 'other');
      expect(connections.deleteEdge).toHaveBeenCalledWith('me', 'other');
    });
  });

  describe('block', () => {
    it('throws 422 for a self block', async () => {
      await expect(makeService().block(me, 'me')).rejects.toMatchObject({
        code: ERROR_CODE.CANNOT_CONNECT_SELF,
        status: 422,
      });
    });

    it('throws 404 STUDENT_NOT_FOUND for an unknown target', async () => {
      const service = makeService(
        makeConnections(),
        makeDirectory({ exists: jest.fn().mockResolvedValue(false) }),
      );
      await expect(service.block(me, 'ghost')).rejects.toMatchObject({
        code: ERROR_CODE.STUDENT_NOT_FOUND,
      });
    });

    it('blocks a known student', async () => {
      const connections = makeConnections();
      await makeService(connections).block(me, 'other');
      expect(connections.block).toHaveBeenCalledWith('me', 'other');
    });
  });

  describe('listStudents', () => {
    it('excludes self + blocked and annotates each result with the view', async () => {
      const connections = makeConnections({
        blockedIds: jest.fn().mockResolvedValue(['blk']),
        findEdges: jest
          .fn()
          .mockResolvedValue([
            edge({ requesterId: 'me', addresseeId: 'a', status: ConnectionStatus.ACCEPTED }),
          ]),
      });
      const directory = makeDirectory({
        list: jest.fn().mockResolvedValue({ items: [summary('a'), summary('b')], total: 2 }),
      });
      const query = listQuery({ q: 'al' });
      const result = await makeService(connections, directory).listStudents(me, query, 1, 20);

      expect(directory.list).toHaveBeenCalledWith(query, ['me', 'blk'], null, 1, 20);
      expect(result.items).toEqual([
        { student: summary('a'), view: ConnectionView.CONNECTED },
        { student: summary('b'), view: ConnectionView.NONE },
      ]);
      expect(result.total).toBe(2);
    });

    it('narrows to the connected ids when connectionStatus=CONNECTED', async () => {
      const connections = makeConnections({
        idsByView: jest.fn().mockResolvedValue(['a', 'b']),
      });
      const directory = makeDirectory();
      await makeService(connections, directory).listStudents(
        me,
        listQuery({ connectionStatus: ConnectionView.CONNECTED }),
        1,
        20,
      );

      expect(connections.idsByView).toHaveBeenCalledWith('me', ConnectionView.CONNECTED);
      expect(directory.list).toHaveBeenCalledWith(expect.anything(), ['me'], ['a', 'b'], 1, 20);
    });

    it('excludes every existing relationship when connectionStatus=NONE', async () => {
      const connections = makeConnections({
        idsByView: jest.fn(async (_self: string, view: ConnectionView) =>
          view === ConnectionView.CONNECTED
            ? ['a']
            : view === ConnectionView.PENDING_OUT
              ? ['b']
              : ['c'],
        ),
      });
      const directory = makeDirectory();
      await makeService(connections, directory).listStudents(
        me,
        listQuery({ connectionStatus: ConnectionView.NONE }),
        1,
        20,
      );

      // NONE has no id list of its own — it becomes an exclusion, and no `restrictToIds`.
      expect(directory.list).toHaveBeenCalledWith(
        expect.anything(),
        ['me', 'a', 'b', 'c'],
        null,
        1,
        20,
      );
    });

    it('shows presence to a connection but hides it from a stranger (CONNECTIONS default)', async () => {
      const connections = makeConnections({
        findEdges: jest
          .fn()
          .mockResolvedValue([
            edge({ requesterId: 'me', addresseeId: 'a', status: ConnectionStatus.ACCEPTED }),
          ]),
      });
      const seen = new Date('2026-07-20T10:00:00Z');
      const directory = makeDirectory({
        list: jest.fn().mockResolvedValue({
          items: [summary('a', { lastSeenAt: seen }), summary('b', { lastSeenAt: seen })],
          total: 2,
        }),
      });
      const presence = makePresence({
        onlineAmong: jest.fn().mockResolvedValue(new Set(['a', 'b'])),
      });
      const result = await makeService(connections, directory, presence).listStudents(
        me,
        listQuery(),
        1,
        20,
      );

      expect(result.items[0]?.student).toMatchObject({ online: true, lastSeenAt: seen });
      expect(result.items[1]?.student).toMatchObject({ online: false, lastSeenAt: null });
    });

    it('hides presence from everyone when the student chose NOBODY', async () => {
      const connections = makeConnections({
        findEdges: jest
          .fn()
          .mockResolvedValue([
            edge({ requesterId: 'me', addresseeId: 'a', status: ConnectionStatus.ACCEPTED }),
          ]),
      });
      const directory = makeDirectory({
        list: jest.fn().mockResolvedValue({
          items: [
            summary('a', {
              lastSeenAt: new Date('2026-07-20T10:00:00Z'),
              lastSeenVisibility: LastSeenVisibility.NOBODY,
            }),
          ],
          total: 1,
        }),
      });
      const presence = makePresence({
        onlineAmong: jest.fn().mockResolvedValue(new Set(['a'])),
      });
      const result = await makeService(connections, directory, presence).listStudents(
        me,
        listQuery(),
        1,
        20,
      );

      expect(result.items[0]?.student).toMatchObject({ online: false, lastSeenAt: null });
    });

    it('shows presence to a stranger when the student chose EVERYONE', async () => {
      const directory = makeDirectory({
        list: jest.fn().mockResolvedValue({
          items: [summary('b', { lastSeenVisibility: LastSeenVisibility.EVERYONE })],
          total: 1,
        }),
      });
      const presence = makePresence({
        onlineAmong: jest.fn().mockResolvedValue(new Set(['b'])),
      });
      const result = await makeService(makeConnections(), directory, presence).listStudents(
        me,
        listQuery(),
        1,
        20,
      );

      expect(result.items[0]?.student.online).toBe(true);
    });
  });

  describe('search', () => {
    it('delegates to listStudents with only `q` set, sorted by name', async () => {
      const directory = makeDirectory();
      await makeService(makeConnections(), directory).search(me, 'al', 1, 20);

      expect(directory.list).toHaveBeenCalledWith(
        expect.objectContaining({ q: 'al', sort: StudentSort.NAME, connectionStatus: null }),
        ['me'],
        null,
        1,
        20,
      );
    });

    it('accepts a null query — an empty search is the full list', async () => {
      const directory = makeDirectory();
      await makeService(makeConnections(), directory).search(me, null, 1, 20);

      expect(directory.list).toHaveBeenCalledWith(
        expect.objectContaining({ q: null }),
        ['me'],
        null,
        1,
        20,
      );
    });
  });

  describe('listConnections', () => {
    it('maps accepted edges to the other student + connectedAt', async () => {
      const accepted = edge({
        requesterId: 'other',
        addresseeId: 'me',
        status: ConnectionStatus.ACCEPTED,
        respondedAt: new Date('2026-07-05T00:00:00Z'),
      });
      const connections = makeConnections({
        listAccepted: jest.fn().mockResolvedValue({ items: [accepted], total: 1 }),
      });
      const directory = makeDirectory({
        findSummaries: jest.fn().mockResolvedValue([summary('other')]),
      });
      const result = await makeService(connections, directory).listConnections(me, 1, 20);
      expect(directory.findSummaries).toHaveBeenCalledWith(['other']);
      expect(result.items).toEqual([
        { student: summary('other'), connectedAt: new Date('2026-07-05T00:00:00Z') },
      ]);
    });
  });

  describe('listRequests', () => {
    it('incoming: the other student is the requester', async () => {
      const pending = edge({ id: 'r1', requesterId: 'other', addresseeId: 'me' });
      const connections = makeConnections({
        listPending: jest.fn().mockResolvedValue({ items: [pending], total: 1 }),
      });
      const directory = makeDirectory({
        findSummaries: jest.fn().mockResolvedValue([summary('other')]),
      });
      const result = await makeService(connections, directory).listRequests(me, 'incoming', 1, 20);
      expect(connections.listPending).toHaveBeenCalledWith('me', 'incoming', 1, 20);
      expect(result.items).toEqual([
        { connectionId: 'r1', student: summary('other'), createdAt: pending.createdAt },
      ]);
    });
  });
});
