/**
 * Static app metadata consumed for <title>/<meta> tags. `siblings` are related
 * Dropout tools cross-linked in the UI.
 */
import type { AppConfig } from "#lib/types.js";

export const APP_CONFIG: AppConfig = {
	name: "Day Zero",
	description: "Track every goal as a live countdown — many milestones, one clean board, no ads.",
	url: "https://day-zero.dropoutstudio.co",
	author: {
		name: "Dropout Studio",
		url: "https://dropoutstudio.co"
	},
	siblings: [
		{
			name: "Order Processor",
			url: "https://order-processor.dropoutstudio.co"
		},
		{
			name: "Invoice Generator",
			url: "https://invoice-generator.dropoutstudio.co"
		}
	]
};
