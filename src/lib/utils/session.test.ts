// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The module reads `browser` from SvelteKit; in vitest that is false, so the
// cookie helpers answer as if there were no document. Stub it to true.
vi.mock('$app/environment', () => ({ browser: true }));

import { sharedSession, MARKER_COOKIE } from './session';

describe('sharedSession', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		document.cookie = `${MARKER_COOKIE}=; Max-Age=0`;
	});
	afterEach(() => vi.useRealTimers());

	it('reads only the marker, never a token', () => {
		expect(sharedSession.present()).toBe(false);
		document.cookie = `${MARKER_COOKIE}=user-a`;
		expect(sharedSession.present()).toBe(true);
		expect(sharedSession.who()).toBe('user-a');
	});

	it('notices a different person signing in on the other app', () => {
		document.cookie = `${MARKER_COOKIE}=user-a`;
		const gone = vi.fn();
		const changed = vi.fn();
		const stop = sharedSession.watch(gone, changed);
		document.cookie = `${MARKER_COOKIE}=user-b`;
		vi.advanceTimersByTime(1100);
		expect(changed).toHaveBeenCalledWith('user-b');
		expect(gone).not.toHaveBeenCalled();
		stop();
	});

	it('notices the other app signing out within a second', () => {
		document.cookie = `${MARKER_COOKIE}=user-a`;
		const gone = vi.fn();
		const stop = sharedSession.watch(gone);
		vi.advanceTimersByTime(1500);
		expect(gone).not.toHaveBeenCalled();
		document.cookie = `${MARKER_COOKIE}=; Max-Age=0`;
		vi.advanceTimersByTime(1100);
		expect(gone).toHaveBeenCalledTimes(1);
		stop();
	});
});
