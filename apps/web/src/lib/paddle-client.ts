'use client';

import { initializePaddle, type Paddle } from '@paddle/paddle-js';

// Paddle Billing's checkout.url always points back at our own domain with a
// `_ptxn` query parameter — there is no pure server-redirect hosted checkout
// in Paddle Billing (confirmed against a real sandbox transaction: redirecting
// the browser there with no Paddle.js on the page shows nothing). Paddle.js
// is what notices `_ptxn` and opens the checkout overlay. See the 2026-10-01
// amendment to docs/adr/ADR-007-paddle-payments.md.
//
// The client token is separate from PADDLE_API_KEY and safe to expose to the
// browser by design — it can only open checkouts, not call the server-side
// API. Its own prefix (test_ / live_) tells Paddle.js which environment to
// talk to, same pattern as the server-side API key in lib/paddle.ts.
let paddlePromise: Promise<Paddle | undefined> | null = null;

export function getPaddleClient(): Promise<Paddle | undefined> {
  if (!paddlePromise) {
    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
    if (!token) {
      paddlePromise = Promise.resolve(undefined);
    } else {
      // A successful init is cached for the page's lifetime, but a rejection
      // must not be: Paddle.js can fail to load for transient reasons (ad
      // blocker, CSP, dropped network). Keeping the rejected promise memoized
      // would make every later click replay the same failure even once the
      // script is reachable, so clear it and let the next call retry.
      // Caveat: @paddle/paddle-js 1.6.5 memoizes its own CDN-load promise
      // (rejections included) and never clears it, so within one page load the
      // retry will usually re-reject immediately rather than re-fetch the
      // script. Clearing here is still correct on our side and costs nothing.
      const attempt = initializePaddle({
        token,
        environment: token.startsWith('test_') ? 'sandbox' : 'production',
      });
      paddlePromise = attempt;
      attempt.catch(() => {
        if (paddlePromise === attempt) paddlePromise = null;
      });
    }
  }
  return paddlePromise;
}
