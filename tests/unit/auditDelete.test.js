// Deletion is the only mutation admins may perform on the audit trail, so the
// guards around it are tested directly: what may be deleted, who is recorded as
// having done it, and that the DB-level bypass is always handed back.
jest.mock('../../models/adminAuditModel');

const AdminAudit = require('../../models/adminAuditModel');
const auditService = require('../../services/auditService');
const { deleteBody } = require('../../validators/auditValidators');

describe('audit delete — request validation', () => {
  const check = (body) => deleteBody.validate(body).error;

  it('rejects an empty body (an unqualified request must never mean "delete all")', () => {
    expect(check({})).toBeTruthy();
  });

  it('rejects both criteria at once (ambiguous blast radius)', () => {
    expect(check({ ids: [1], olderThanDays: 30 })).toBeTruthy();
  });

  it('rejects an empty id list', () => {
    expect(check({ ids: [] })).toBeTruthy();
  });

  it('caps a single request at 500 ids', () => {
    expect(check({ ids: Array.from({ length: 501 }, (_, i) => i + 1) })).toBeTruthy();
    expect(check({ ids: Array.from({ length: 500 }, (_, i) => i + 1) })).toBeFalsy();
  });

  it('rejects olderThanDays below 1 — "older than 0 days" is everything', () => {
    expect(check({ olderThanDays: 0 })).toBeTruthy();
    expect(check({ olderThanDays: 1 })).toBeFalsy();
  });

  it('accepts each criterion on its own', () => {
    expect(check({ ids: [1, 2, 3] })).toBeFalsy();
    expect(check({ olderThanDays: 90 })).toBeFalsy();
  });
});

describe('audit delete — actor attribution', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    AdminAudit.remove.mockResolvedValue({ deleted: 2 });
  });

  it('takes the actor from the server auth context, NEVER the request body', async () => {
    const req = {
      admin: { uid: 'admin-uid-1', authenticated: true },
      body: { ids: [1, 2], actor: { id: 'spoofed', name: 'Attacker' } }, // must be ignored
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'Chrome/120' },
      requestId: 'req-9',
    };

    await auditService.remove({ ids: [1, 2] }, req);

    const [args] = AdminAudit.remove.mock.calls;
    expect(args[0].actor.id).toBe('admin-uid-1');
    expect(JSON.stringify(args[0].actor)).not.toContain('spoofed');
    expect(JSON.stringify(args[0].actor)).not.toContain('Attacker');
  });

  it('records the originating IP (first proxy hop), UA and request id', async () => {
    const req = {
      admin: { uid: 'admin-uid-1' },
      headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1', 'user-agent': 'Chrome/120' },
      requestId: 'req-9',
    };

    await auditService.remove({ olderThanDays: 90 }, req);

    const { context } = AdminAudit.remove.mock.calls[0][0];
    expect(context.ip).toBe('203.0.113.7');
    expect(context.userAgent).toBe('Chrome/120');
    expect(context.requestId).toBe('req-9');
  });
});
