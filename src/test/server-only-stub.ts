/**
 * Stands in for the `server-only` package under vitest.
 *
 * That package exists to make a build fail when server code is imported into a
 * client bundle. Tests are already server-side, so the guard has nothing to
 * catch and its client entry point would throw on import.
 */
export {};
