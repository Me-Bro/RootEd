import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const errorRate = new Rate('errors');

export const options = {
  stages: [
    { duration: '30s', target: 20 }, // ramp up
    { duration: '2m', target: 100 }, // sustained 100 concurrent
    { duration: '30s', target: 0 }, // ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<400'], // read p95 < 400ms
    errors: ['rate<0.01'],
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
const TENANT = __ENV.TENANT || 'demo';

let accessToken = '';

export function setup() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      email: __ENV.TEST_EMAIL || 'admin@test.com',
      password: __ENV.TEST_PASSWORD || 'TestPass123!',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Host: `${TENANT}.${__ENV.APP_DOMAIN || 'rooted.app'}`,
      },
    }
  );

  check(res, { 'login ok': (r) => r.status === 200 });
  return { token: res.json('accessToken') };
}

export default function (data) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.token}`,
    Host: `${TENANT}.${__ENV.APP_DOMAIN || 'rooted.app'}`,
  };

  // Test read endpoints (p95 < 400ms target)
  const endpoints = [
    '/academic/years',
    '/academic/students?sectionId=',
    '/staff/members',
    '/expense/entries',
    '/inventory/items',
    '/fee/assignments',
  ];

  for (const endpoint of endpoints) {
    const res = http.get(`${BASE_URL}${endpoint}`, { headers });
    const ok = check(res, {
      [`${endpoint} status 200 or 400`]: (r) => r.status === 200 || r.status === 400,
    });
    errorRate.add(!ok);
  }

  sleep(1);
}
