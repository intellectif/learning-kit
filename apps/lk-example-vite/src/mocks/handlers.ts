import { HttpResponse, http } from 'msw';
import { LRS_ENDPOINT } from '../config';

/**
 * Stands in for a real Learning Record Store. Accepts the xAPI statement and
 * returns 200 so the `useXAPI` retry path is not exercised in the happy demo.
 */
export const handlers = [
  http.post(LRS_ENDPOINT, async ({ request }) => {
    const statement = await request.json();
    console.info('[mock LRS] received xAPI statement', statement);
    return HttpResponse.json({ accepted: true }, { status: 200 });
  }),
];
