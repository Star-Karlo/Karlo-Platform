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

/**
 * Finance — Invoice, Jurnal, Laporan and COA — is hidden from the sidebar.
 *
 * The screens and their routes are untouched: anyone holding a direct link
 * still reaches them, which is deliberate. This hides a module that is not
 * ready to be put in front of operators; it is not an access control, and
 * must not be mistaken for one. What a user may actually open is decided by
 * their permissions, server-side.
 */
export const FINANCE_ENABLED = false;
