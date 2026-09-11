<script lang="ts">
	import AgreementListPage from '$lib/pages/AgreementListPage.svelte';
</script>

<!-- Admins audit agreements; the create and bulk-upload paths belong to the
     companies that sign them. -->
<AgreementListPage basePath="/a/agreement-list" title="Agreement List" canCreate={false} />
