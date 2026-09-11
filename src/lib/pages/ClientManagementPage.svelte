<script lang="ts">
	import { Network } from 'lucide-svelte';
	import CustomerListPage from './CustomerListPage.svelte';
	import { Card } from '$lib/components/ui';

	/**
	 * Client Management.
	 *
	 * A client is a company you trade with; a customer is a party you deal with.
	 * The services model both as one `/customers` record, with a link to a real
	 * company filled in once that company exists — so this screen is the
	 * customer list under the name the transporter uses for it.
	 *
	 * The claim flow that turns a client into a real tenant is not built yet.
	 */
	let { title = 'Client Management' }: { title?: string } = $props();
</script>

<CustomerListPage {title} />

<Card class="mt-gutter">
	<p class="text-xs italic text-muted">
		Inviting a client to claim their own account — so they can sign in and see the orders raised
		for them — is still being designed. Clients added here are records this company owns.
	</p>
</Card>
