/**
 * Copy text, reporting whether it worked.
 *
 * `navigator.clipboard` is unavailable outside a secure context and can be
 * refused by permission, so the caller is told rather than left believing a
 * silent failure succeeded — the console's copy buttons say "salin manual"
 * when this returns false.
 */
export async function copyText(text: string): Promise<boolean> {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}
