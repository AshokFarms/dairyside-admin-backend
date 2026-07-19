// Service unit test with the data-access layer mocked — no DB required.
jest.mock('../../models/adminCustomerModel');

const AdminCustomer = require('../../models/adminCustomerModel');
const customerService = require('../../services/customerService');

describe('customerService', () => {
  afterEach(() => jest.clearAllMocks());

  describe('getById', () => {
    it('shapes a customer row into the API contract', async () => {
      AdminCustomer.findById.mockResolvedValue({
        id: 7,
        uid: 'uid-7',
        name: 'Asha',
        email: 'asha@example.com',
        phone: '9999999999',
        email_verified: 1,
        wallet_balance: '250.50',
        total_orders: '12',
        active_subscriptions: '2',
        created_at: '2026-01-01T00:00:00.000Z',
        provider: 'password',
        last_login: null,
      });

      const result = await customerService.getById(7);

      expect(result.id).toBe(7);
      expect(result.email_verified).toBe(true);
      expect(result.wallet_balance).toBe(250.5);
      expect(result.total_orders).toBe(12);
      expect(result.active_subscriptions).toBe(2);
      expect(AdminCustomer.findById).toHaveBeenCalledWith(7);
    });

    it('throws a 404 ApiError when the customer does not exist', async () => {
      AdminCustomer.findById.mockResolvedValue(null);
      await expect(customerService.getById(999)).rejects.toMatchObject({ statusCode: 404 });
    });
  });

  describe('list', () => {
    it('returns a paginated, shaped envelope', async () => {
      AdminCustomer.list.mockResolvedValue({
        rows: [
          {
            id: 1,
            uid: 'u1',
            name: 'A',
            email: 'a@x.com',
            phone: null,
            email_verified: 0,
            wallet_balance: 0,
            total_orders: 0,
            active_subscriptions: 0,
            created_at: '2026-01-01',
          },
        ],
        total: 1,
      });

      const res = await customerService.list({ page: 1, limit: 20 });
      expect(res.total).toBe(1);
      expect(res.data).toHaveLength(1);
      expect(res.data[0].email_verified).toBe(false);
      expect(res.data[0].phone).toBeNull();
    });
  });
});
