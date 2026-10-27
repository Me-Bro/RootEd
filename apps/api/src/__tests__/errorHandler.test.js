import { jest } from '@jest/globals';
import { errorHandler } from '../middleware/errorHandler.js';

function run(err) {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  errorHandler(err, { method: 'POST', url: '/x' }, res, () => {});
  return res;
}

test('a duplicate key becomes a 409 naming the field, not a 500', () => {
  const res = run({ code: 11000, keyPattern: { tenantId: 1, code: 1 } });
  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json).toHaveBeenCalledWith({ error: 'A record with this code already exists' });
});

test('a duplicate key with no usable pattern still returns 409', () => {
  const res = run({ code: 11000 });
  expect(res.status).toHaveBeenCalledWith(409);
  expect(res.json).toHaveBeenCalledWith({ error: 'Record already exists' });
});

test('other errors keep their old behaviour', () => {
  expect(run({ status: 404, message: 'Not found' }).status).toHaveBeenCalledWith(404);
});
