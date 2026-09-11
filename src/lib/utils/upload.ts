import { api } from '$lib/utils/api';
import { ENDPOINTS } from '$lib/constants/endpoints';

/**
 * What the file is for. The service derives the storage key from this plus the
 * caller's company, so the client never chooses where a file lands.
 */
export type UploadPurpose =
	| 'truckDocument'
	| 'truckPhoto'
	| 'agreementDocument'
	| 'orderPod';

export interface UploadedFile {
	/** Storage key. This is what gets persisted on the record. */
	key: string;
	fileName: string;
	contentType: string;
	sizeBytes: number;
}

export interface PresignResponse {
	key: string;
	url: string;
	method?: string;
	headers?: Record<string, string>;
	expiresIn?: number;
}

/** Raised when the upload endpoints are not deployed yet. */
export class UploadsUnavailable extends Error {
	constructor() {
		super('File uploads are not available yet.');
		this.name = 'UploadsUnavailable';
	}
}

/**
 * Whether the service can sign uploads.
 *
 * Probed once and cached, so a form can disable its file fields with a reason
 * rather than letting someone pick a file and fail on submit.
 */
let availability: Promise<boolean> | null = null;

export function uploadsAvailable(): Promise<boolean> {
	availability ??= api
		.post(ENDPOINTS.uploads.presign, {
			purpose: 'truckDocument',
			fileName: 'probe.pdf',
			contentType: 'application/pdf',
			sizeBytes: 1
		})
		.then(() => true)
		.catch((e: any) => {
			// A 4xx that is not "missing" means the endpoint exists and simply
			// refused this probe, which still tells us uploads are wired up.
			const status = e?.response?.status;
			return status !== undefined && status !== 404 && status !== 501;
		});
	return availability;
}

/**
 * Upload one file and return the key to persist.
 *
 * The PUT goes straight from the browser to S3, so the file never passes
 * through the API. `onProgress` receives 0-100.
 */
export async function uploadFile(
	file: File,
	purpose: UploadPurpose,
	onProgress?: (percent: number) => void
): Promise<UploadedFile> {
	let presigned: PresignResponse;

	try {
		const res = await api.post(ENDPOINTS.uploads.presign, {
			purpose,
			fileName: file.name,
			contentType: file.type || 'application/octet-stream',
			sizeBytes: file.size
		});
		presigned = res.data.data ?? res.data;
	} catch (e: any) {
		if (e?.response?.status === 404 || e?.response?.status === 501) throw new UploadsUnavailable();
		throw e;
	}

	await putToStorage(file, presigned, onProgress);

	return {
		key: presigned.key,
		fileName: file.name,
		contentType: file.type || 'application/octet-stream',
		sizeBytes: file.size
	};
}

/**
 * The raw PUT.
 *
 * XMLHttpRequest rather than fetch purely for upload progress — fetch cannot
 * report it. Deliberately not the shared axios instance: this request goes to
 * S3, and attaching the Karlo Authorization header to a signed URL makes S3
 * reject it.
 */
function putToStorage(
	file: File,
	presigned: PresignResponse,
	onProgress?: (percent: number) => void
): Promise<void> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open(presigned.method ?? 'PUT', presigned.url, true);

		for (const [header, value] of Object.entries(presigned.headers ?? {})) {
			xhr.setRequestHeader(header, value);
		}

		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable) {
				onProgress?.(Math.round((event.loaded / event.total) * 100));
			}
		};
		xhr.onload = () =>
			xhr.status >= 200 && xhr.status < 300
				? resolve()
				: reject(new Error(`Storage rejected the upload (${xhr.status}).`));
		xhr.onerror = () => reject(new Error('The upload could not reach storage.'));
		xhr.ontimeout = () => reject(new Error('The upload timed out.'));
		xhr.timeout = 120_000;

		xhr.send(file);
	});
}

/**
 * A short-lived URL for viewing a stored file.
 *
 * Uploads live on a private prefix, so there is no permanent public URL to link
 * to — ask for one when it is needed and do not store the result.
 */
export async function downloadUrl(key: string): Promise<string> {
	const res = await api.post(ENDPOINTS.uploads.downloadUrl, { key });
	return (res.data.data ?? res.data).url;
}
