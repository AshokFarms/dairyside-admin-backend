const { parsePagination } = require('../../utils/pagination');

describe('parsePagination', () => {
  it('applies defaults when nothing is provided', () => {
    const r = parsePagination({}, { defaultSort: 'created_at' });
    expect(r.page).toBe(1);
    expect(r.limit).toBe(20);
    expect(r.offset).toBe(0);
    expect(r.sortOrder).toBe('DESC');
  });

  it('computes offset from page and limit', () => {
    const r = parsePagination({ page: 3, limit: 10 }, { defaultSort: 'created_at' });
    expect(r.offset).toBe(20);
    expect(r.limit).toBe(10);
  });

  it('only allows whitelisted sort columns, else falls back to default', () => {
    const r = parsePagination(
      { sortBy: 'DROP TABLE', sortOrder: 'asc' },
      { sortable: ['name', 'created_at'], defaultSort: 'created_at' }
    );
    expect(r.sortBy).toBe('created_at');
    expect(r.sortOrder).toBe('ASC');
  });

  it('accepts a whitelisted sort column', () => {
    const r = parsePagination({ sortBy: 'name' }, { sortable: ['name'], defaultSort: 'name' });
    expect(r.sortBy).toBe('name');
  });
});
