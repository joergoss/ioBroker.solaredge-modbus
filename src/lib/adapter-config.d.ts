// This file extends the AdapterConfig type from "@types/iobroker"

// Augment the globally declared type ioBroker.AdapterConfig
declare global {
	namespace ioBroker {
		interface AdapterConfig {
			hostname: string;
			port: number;
			unitId: number;
			com_wait_pause: number;
			main_loop_pause: number;
			connection_timeout: number
			log_raw_registers: boolean
			meter_count: number
			battery_count: number
			max_register_block_size: number
		}
	}
}

// this is required so the above AdapterConfig is found by TypeScript / type checking
export {};