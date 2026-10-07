/**
 * Parts of the product that are built but not being shown yet.
 *
 * A flag rather than deleted code: LTL — several customers' orders combined on
 * one truck — works, and is expected back. Removing it would mean rebuilding
 * the grouping, the combined-load simulation and the per-group row switcher
 * from scratch; leaving it on screen means offering an operator a flow the
 * business has not finished deciding.
 *
 * One flag read in both places, so Allocate and Control Tower cannot disagree
 * about whether LTL exists. Turning it back on is this line.
 */
export const LTL_ENABLED = false;
