import {
  emailDomainProblem,
  assertDeliverableDomain,
  clearEmailDomainCache,
} from '../utils/emailDomain.js';

const dnsErr = (code) => Object.assign(new Error(code), { code });

// Each record type answers with a value, or throws the named DNS error code.
function stub({ mx, a, aaaa }) {
  const calls = { resolveMx: 0, resolve4: 0, resolve6: 0 };
  const answer = (name, v) => async () => {
    calls[name]++;
    if (typeof v === 'string') throw dnsErr(v);
    return v;
  };
  return {
    calls,
    resolveMx: answer('resolveMx', mx ?? 'ENODATA'),
    resolve4: answer('resolve4', a ?? 'ENODATA'),
    resolve6: answer('resolve6', aaaa ?? 'ENODATA'),
  };
}

const on = (resolver) => ({ resolver, enabled: true });

beforeEach(() => clearEmailDomainCache());

test('MX record: accepted', async () => {
  const r = stub({ mx: [{ exchange: 'mx.example.com', priority: 10 }] });
  expect(await emailDomainProblem('a@example.com', on(r))).toBeNull();
});

test('no MX but an A record: accepted (implicit MX)', async () => {
  const r = stub({ mx: 'ENODATA', a: ['1.2.3.4'] });
  expect(await emailDomainProblem('a@example.com', on(r))).toBeNull();
});

test('nothing at all: rejected', async () => {
  const r = stub({ mx: 'ENOTFOUND', a: 'ENOTFOUND', aaaa: 'ENOTFOUND' });
  expect(await emailDomainProblem('a@gmial.com', on(r))).toMatch(/gmial\.com cannot receive/);
  await expect(assertDeliverableDomain('a@gmial.com', on(r))).rejects.toMatchObject({
    status: 422,
  });
});

test('null MX ("0 ."): rejected even if the domain has an A record', async () => {
  const r = stub({ mx: [{ exchange: '', priority: 0 }], a: ['1.2.3.4'] });
  expect(await emailDomainProblem('a@example.com', on(r))).not.toBeNull();
});

test('DNS timeout: fails open and is not cached', async () => {
  const r = stub({ mx: 'ETIMEOUT' });
  expect(await emailDomainProblem('a@example.com', on(r))).toBeNull();
  await emailDomainProblem('b@example.com', on(r));
  expect(r.calls.resolveMx).toBe(2);
});

test('answers are cached per domain', async () => {
  const r = stub({ mx: [{ exchange: 'mx.example.com', priority: 10 }] });
  await emailDomainProblem('a@example.com', on(r));
  await emailDomainProblem('b@EXAMPLE.com', on(r));
  expect(r.calls.resolveMx).toBe(1);
});

test('flag off: no lookup', async () => {
  const r = stub({ mx: 'ENOTFOUND' });
  expect(await emailDomainProblem('a@gmial.com', { resolver: r, enabled: false })).toBeNull();
  expect(r.calls.resolveMx).toBe(0);
});
