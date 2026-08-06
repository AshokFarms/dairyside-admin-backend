// Service unit test with the data-access layer mocked — no DB required.
jest.mock('../../models/adminFarmVisitModel');

const AdminFarmVisit = require('../../models/adminFarmVisitModel');
const farmVisitService = require('../../services/farmVisitService');

const FARM = { id: 1, slug: 'f', name: 'Farm', is_active: 1, latitude: '15.2165000', longitude: '79.9074000' };

const slotRow = (over = {}) => ({
  id: 5,
  farm_id: 1,
  visit_date: '2026-09-01',
  start_time: '07:00:00',
  end_time: '09:00:00',
  visit_type: 'GENERAL',
  capacity: 25,
  seats_booked: 0,
  price_per_adult: '0.00',
  price_per_child: '0.00',
  status: 'OPEN',
  notes: null,
  ...over,
});

describe('farmVisitService', () => {
  beforeEach(() => {
    AdminFarmVisit.findFarm.mockResolvedValue(FARM);
  });
  afterEach(() => jest.clearAllMocks());

  describe('shaping', () => {
    it('converts DECIMAL strings to numbers and flags free slots', async () => {
      AdminFarmVisit.listSlots.mockResolvedValue({ rows: [slotRow()], total: 1 });

      const { data } = await farmVisitService.listSlots(1, {});

      expect(data[0].price_per_adult).toBe(0);
      expect(data[0].capacity).toBe(25);
      expect(data[0].is_free).toBe(true);
      expect(data[0].seats_available).toBe(25);
    });

    it('marks a priced slot as not free', async () => {
      AdminFarmVisit.listSlots.mockResolvedValue({
        rows: [slotRow({ price_per_adult: '150.00' })],
        total: 1,
      });
      const { data } = await farmVisitService.listSlots(1, {});
      expect(data[0].is_free).toBe(false);
      expect(data[0].price_per_adult).toBe(150);
    });

    it('converts farm coordinates to numbers for the map', async () => {
      const farm = await farmVisitService.getFarm(1);
      expect(farm.latitude).toBe(15.2165);
      expect(farm.longitude).toBe(79.9074);
      expect(farm.is_active).toBe(true);
    });
  });

  describe('updateSlot capacity guard', () => {
    it('refuses to shrink capacity below seats already booked, and says by how much', async () => {
      AdminFarmVisit.findSlot.mockResolvedValue(slotRow({ capacity: 25, seats_booked: 8 }));

      await expect(farmVisitService.updateSlot(5, { capacity: 5 })).rejects.toMatchObject({
        statusCode: 409,
      });
      await expect(farmVisitService.updateSlot(5, { capacity: 5 })).rejects.toThrow(/8 seat/);
      // The write must never be attempted.
      expect(AdminFarmVisit.updateSlot).not.toHaveBeenCalled();
    });

    it('allows shrinking capacity down to exactly seats_booked', async () => {
      AdminFarmVisit.findSlot.mockResolvedValue(slotRow({ capacity: 25, seats_booked: 8 }));
      AdminFarmVisit.updateSlot.mockResolvedValue(1);

      await farmVisitService.updateSlot(5, { capacity: 8 });
      expect(AdminFarmVisit.updateSlot).toHaveBeenCalledWith(5, { capacity: 8 });
    });

    it('translates the CHECK constraint into a 409 rather than a 500', async () => {
      AdminFarmVisit.findSlot.mockResolvedValue(slotRow());
      AdminFarmVisit.updateSlot.mockRejectedValue(Object.assign(new Error('check failed'), { errno: 3819 }));

      await expect(farmVisitService.updateSlot(5, { capacity: 10 })).rejects.toMatchObject({
        statusCode: 409,
      });
    });

    it('404s for a slot that does not exist', async () => {
      AdminFarmVisit.findSlot.mockResolvedValue(null);
      await expect(farmVisitService.updateSlot(999, { capacity: 10 })).rejects.toMatchObject({
        statusCode: 404,
      });
    });
  });

  describe('deleteSlot', () => {
    it('refuses to delete a slot with bookings and points at CANCELLED instead', async () => {
      AdminFarmVisit.findSlot.mockResolvedValue(slotRow({ seats_booked: 3 }));

      await expect(farmVisitService.deleteSlot(5)).rejects.toMatchObject({ statusCode: 409 });
      await expect(farmVisitService.deleteSlot(5)).rejects.toThrow(/CANCELLED/);
      expect(AdminFarmVisit.deleteSlot).not.toHaveBeenCalled();
    });

    it('deletes an empty slot', async () => {
      AdminFarmVisit.findSlot.mockResolvedValue(slotRow({ seats_booked: 0 }));
      AdminFarmVisit.deleteSlot.mockResolvedValue(1);

      expect(await farmVisitService.deleteSlot(5)).toEqual({ id: 5 });
    });
  });

  describe('updateBookingStatus', () => {
    const booking = (status) => ({ id: 9, status, farm_id: 1, seats: 2, visit_date: '2026-09-01' });

    it('routes CANCELLED through the transactional release so seats come back', async () => {
      AdminFarmVisit.findBooking.mockResolvedValue(booking('CONFIRMED'));
      AdminFarmVisit.cancelBookingAndRelease.mockResolvedValue('cancelled');

      await farmVisitService.updateBookingStatus(9, 'CANCELLED');

      expect(AdminFarmVisit.cancelBookingAndRelease).toHaveBeenCalledWith(9);
      // A plain status UPDATE here would leak the seats forever.
      expect(AdminFarmVisit.setBookingStatus).not.toHaveBeenCalled();
    });

    it('treats a repeat cancel as success, not an error', async () => {
      AdminFarmVisit.findBooking.mockResolvedValue(booking('CANCELLED'));
      AdminFarmVisit.cancelBookingAndRelease.mockResolvedValue('already_cancelled');

      await expect(farmVisitService.updateBookingStatus(9, 'CANCELLED')).resolves.toBeDefined();
    });

    it('does NOT touch seats for non-cancel transitions', async () => {
      AdminFarmVisit.findBooking.mockResolvedValue(booking('CONFIRMED'));
      AdminFarmVisit.setBookingStatus.mockResolvedValue(1);

      await farmVisitService.updateBookingStatus(9, 'COMPLETED');

      expect(AdminFarmVisit.setBookingStatus).toHaveBeenCalledWith(9, 'COMPLETED');
      expect(AdminFarmVisit.cancelBookingAndRelease).not.toHaveBeenCalled();
    });

    it('refuses to revive a cancelled booking, because its seats are gone', async () => {
      AdminFarmVisit.findBooking.mockResolvedValue(booking('CANCELLED'));

      await expect(farmVisitService.updateBookingStatus(9, 'CONFIRMED')).rejects.toMatchObject({
        statusCode: 409,
      });
      expect(AdminFarmVisit.setBookingStatus).not.toHaveBeenCalled();
    });
  });

  describe('bulkGenerateSlots', () => {
    it('expands a date range across templates and skips closed weekdays', async () => {
      AdminFarmVisit.bulkCreateSlots.mockResolvedValue(10);

      // 2026-09-01 is a Tuesday; the range covers 7 days with 1 Monday in it.
      const res = await farmVisitService.bulkGenerateSlots(1, {
        from: '2026-09-01',
        to: '2026-09-07',
        templates: [
          { start_time: '07:00:00', end_time: '09:00:00', capacity: 25 },
          { start_time: '16:30:00', end_time: '18:30:00', capacity: 25 },
        ],
        skip_weekdays: [1],
      });

      const rows = AdminFarmVisit.bulkCreateSlots.mock.calls[0][0];
      expect(rows).toHaveLength(12); // 6 open days x 2 templates
      expect(rows.every((r) => r.farm_id === 1)).toBe(true);
      expect(rows.some((r) => r.visit_date === '2026-09-07')).toBe(false); // the Monday
      expect(res.attempted).toBe(12);
      expect(res.skipped_existing).toBe(2); // 12 attempted, 10 created
    });

    it('reports how many already existed so a re-run is understandable', async () => {
      AdminFarmVisit.bulkCreateSlots.mockResolvedValue(0);

      const res = await farmVisitService.bulkGenerateSlots(1, {
        from: '2026-09-01',
        to: '2026-09-01',
        templates: [{ start_time: '07:00:00', end_time: '09:00:00', capacity: 25 }],
      });

      expect(res).toEqual({ attempted: 1, created: 0, skipped_existing: 1 });
    });

    it('does not cross a month boundary incorrectly', async () => {
      AdminFarmVisit.bulkCreateSlots.mockResolvedValue(3);
      await farmVisitService.bulkGenerateSlots(1, {
        from: '2026-08-30',
        to: '2026-09-01',
        templates: [{ start_time: '07:00:00', end_time: '09:00:00', capacity: 5 }],
      });
      const dates = AdminFarmVisit.bulkCreateSlots.mock.calls[0][0].map((r) => r.visit_date);
      expect(dates).toEqual(['2026-08-30', '2026-08-31', '2026-09-01']);
    });
  });

  describe('bookingStats', () => {
    it('excludes cancelled bookings from the seat count', async () => {
      AdminFarmVisit.bookingStats.mockResolvedValue([
        { status: 'CONFIRMED', n: 4, seats: 10 },
        { status: 'CANCELLED', n: 2, seats: 5 },
      ]);

      const stats = await farmVisitService.bookingStats(1);

      expect(stats.total).toBe(6);
      // Cancelled seats were released, so counting them would overstate turnout.
      expect(stats.seats).toBe(10);
      expect(stats.by_status.CANCELLED.count).toBe(2);
    });
  });

  describe('section table whitelist', () => {
    it('rejects an unknown section instead of interpolating it into SQL', async () => {
      await expect(farmVisitService.listSection('users; DROP TABLE farms', 1)).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(AdminFarmVisit.listSection).not.toHaveBeenCalled();
    });

    it('maps known sections to their tables', async () => {
      AdminFarmVisit.listSection.mockResolvedValue([]);
      await farmVisitService.listSection('gallery', 1);
      expect(AdminFarmVisit.listSection).toHaveBeenCalledWith('farm_gallery_items', 1);
    });
  });
});
