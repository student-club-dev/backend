import { NotificationListService } from './notification-list.service';
import type { NotificationRepository } from '../domain/notification.repository';

describe('NotificationListService', () => {
  let repository: jest.Mocked<NotificationRepository>;
  let service: NotificationListService;

  beforeEach(() => {
    repository = {
      create: jest.fn(),
      list: jest.fn().mockResolvedValue({ items: [], unreadCount: 0 }),
      markRead: jest.fn().mockResolvedValue(undefined),
      markAllRead: jest.fn().mockResolvedValue(undefined),
      deleteOlderThan: jest.fn().mockResolvedValue(0),
    };
    service = new NotificationListService(repository);
  });

  describe('list', () => {
    it('passes the caller’s id and limit straight through', async () => {
      await service.list('std_1', 30);
      expect(repository.list).toHaveBeenCalledWith('std_1', 30);
    });
  });

  describe('markRead', () => {
    it('marks everything when `all` is set, ignoring any ids alongside it', async () => {
      await service.markRead('std_1', ['ntf_1'], true);
      expect(repository.markAllRead).toHaveBeenCalledWith('std_1');
      expect(repository.markRead).not.toHaveBeenCalled();
    });

    it('marks the listed ids when `all` is not set', async () => {
      await service.markRead('std_1', ['ntf_1', 'ntf_2'], false);
      expect(repository.markRead).toHaveBeenCalledWith('std_1', ['ntf_1', 'ntf_2']);
      expect(repository.markAllRead).not.toHaveBeenCalled();
    });

    it('treats absent ids as an empty batch rather than marking everything', async () => {
      // The dangerous failure mode: a body that slipped past validation must never be read as
      // "mark all". Losing one mark is recoverable; wiping an unread count is not.
      await service.markRead('std_1', undefined, false);
      expect(repository.markRead).toHaveBeenCalledWith('std_1', []);
      expect(repository.markAllRead).not.toHaveBeenCalled();
    });
  });

  describe('purgeOlderThan', () => {
    it('deletes rows older than the retention window, counted back from now', async () => {
      const now = new Date('2026-08-05T00:00:00.000Z');
      await service.purgeOlderThan(90, now);
      expect(repository.deleteOlderThan).toHaveBeenCalledWith(new Date('2026-05-07T00:00:00.000Z'));
    });

    it('returns how many rows went, so the cron can log something meaningful', async () => {
      repository.deleteOlderThan.mockResolvedValue(12);
      await expect(service.purgeOlderThan(90)).resolves.toBe(12);
    });
  });
});
