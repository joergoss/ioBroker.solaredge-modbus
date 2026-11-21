![Logo](admin/solaredge-modbus.png)
# ioBroker.solaredge-modbus

[![NPM version](https://img.shields.io/npm/v/iobroker.solaredge-modbus.svg)](https://www.npmjs.com/package/iobroker.solaredge-modbus)
[![Downloads](https://img.shields.io/npm/dm/iobroker.solaredge-modbus.svg)](https://www.npmjs.com/package/iobroker.solaredge-modbus)
![Number of Installations](https://iobroker.live/badges/solaredge-modbus-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/solaredge-modbus-stable.svg)
[![Dependency Status](https://img.shields.io/david/joergoss/iobroker.solaredge-modbus.svg)](https://david-dm.org/joergoss/iobroker.solaredge-modbus)

[![NPM](https://nodei.co/npm/iobroker.solaredge-modbus.png?downloads=true)](https://nodei.co/npm/iobroker.solaredge-modbus/)

**Tests:** ![Test and Release](https://github.com/joergoss/ioBroker.solaredge-modbus/workflows/Test%20and%20Release/badge.svg)

## solaredge-modbus adapter for ioBroker

Reads a SolarEdge inverter directly via **local SunSpec Modbus TCP** - no SolarEdge cloud account and no internet connection required. Provides inverter, meter and battery values as ioBroker states and supports the SolarEdge storage control registers for writing.

### Requirements

- Modbus TCP enabled on the inverter (SolarEdge SetApp: *Site Communication → Modbus TCP*, default port **1502**).
- The inverter accepts **only one Modbus TCP client at a time**. Stop other Modbus clients (another ioBroker modbus instance, Home Assistant, evcc, …) before enabling this adapter, otherwise you will see connection errors.

### Installation

Until the adapter is published on npm, install it in the ioBroker admin via *Adapters → Install from custom URL* using the GitHub repository URL, or from the command line:

```bash
iobroker url https://github.com/joergoss/ioBroker.solaredge-modbus
```

### Configuration

| Setting | Default | Meaning |
|---|---|---|
| `hostname` | – | IP address or hostname of the inverter (required) |
| `port` | 1502 | Modbus TCP port |
| `unitId` | 1 | Modbus unit id of the inverter |
| `meter_count` | 1 | Number of connected SolarEdge meters (1–3) |
| `battery_count` | 1 | Number of batteries (0–2). Set **0** if no battery is installed - the battery blocks are then not polled at all |
| `com_wait_pause` | 200 | Pause in ms between two Modbus requests |
| `main_loop_pause` | 1000 | Pause in ms between two poll cycles |
| `connection_timeout` | 5000 | Connection/socket timeout in ms |
| `max_register_block_size` | 0 | 0 = default requests. Set e.g. 40 to split long reads into smaller chunks. **Caution:** at least one tested firmware stops answering when the battery block is split - use only together with `log_raw_registers` for diagnosis |
| `read_power_control` | off | Additionally reads the power control block 0xF000 (`rrcr_state`, `active_power_limit`, `cosphi`). Leave off if your firmware does not implement it |
| `read_export_control` | off | Additionally reads the export control block 0xF700 (`mode`, `limit_mode`, `site_limit`) for feed-in limitations |
| `auto_detect_devices` | on for new instances | Detects which meters and batteries really exist from their identification blocks. Off = use `meter_count`/`battery_count`. **Note:** the js-controller merges new native defaults into existing instances on adapter updates, so updating enables this unless you switch it off |
| `redetect_interval_minutes` | 15 | Re-runs auto detection periodically to pick up wiring changes. 0 disables; only used when `auto_detect_devices` is on |
| `log_raw_registers` | off | Log every polled block as raw hex values - only for collecting bug report data |

### Provided states

- `common.*` - SunSpec identification (manufacturer, model, serial number, firmware)
- `ac.*`, `dc.*`, `state.*` - inverter measurements, temperature and status
- `meter.1.*` … `meter.3.*` - per meter currents, voltages, power and energy counters
- `battery.*` - battery 1 (historical, unnumbered ids), `battery.2.*` - battery 2
- `control.*` - SolarEdge storage control, writable states are applied on the next poll cycle
- `powercontrol.*` - optional power control block (RRCR state, active power limit, cos phi), enable with `read_power_control`
- `exportcontrol.*` - optional export/feed-in limitation block, enable with `read_export_control`
- `info.connection` - true while the inverter answers

### Troubleshooting

**Frequent errors at night or when the inverter changes state:** the inverter simply stops answering Modbus requests while it sleeps. The adapter retries with an increasing delay (up to 60 s) and only logs the first failure plus every 30th one, instead of flooding the log.

**Battery energy counters on BYD and LG batteries:** the decoding is correct, but SolarEdge does not provide reliable lifetime counters for these batteries (documented behaviour, see issue #10). The values may be small, reset unexpectedly or be absent. For energy accounting, prefer integrating `battery.instantaneous_power` yourself or use the meter energy counters instead.

**Battery status values:** `battery.status` is numeric and comes with a text mapping (0 Off, 1 Standby, 2 Initializing, 3 Charge, 4 Discharge, 5 Fault, 6 Preserve Charge, 7 Idle, 10 Power Saving). Scripts can keep comparing numbers.

**To report a decoding problem:** enable `log_raw_registers` for a short time and attach the log lines (`raw registers …`) to your GitHub issue. They contain the exact bytes received, which makes a register-by-register comparison possible without access to your inverter.

## Developer manual
This section is intended for the developer. It can be deleted later

### Getting started

You are almost done, only a few steps left:
1. Create a new repository on GitHub with the name `ioBroker.solaredge-modbus`
1. Initialize the current folder as a new git repository:  
	```bash
	git init -b main
	git add .
	git commit -m "Initial commit"
	```
1. Link your local repository with the one on GitHub:  
	```bash
	git remote add origin https://github.com/joergoss/ioBroker.solaredge-modbus
	```

1. Push all files to the GitHub repo:  
	```bash
	git push origin main
	```

1. Head over to [src/main.ts](src/main.ts) and start programming!

### Best Practices
We've collected some [best practices](https://github.com/ioBroker/ioBroker.repositories#development-and-coding-best-practices) regarding ioBroker development and coding in general. If you're new to ioBroker or Node.js, you should
check them out. If you're already experienced, you should also take a look at them - you might learn something new :)

### Scripts in `package.json`
Several npm scripts are predefined for your convenience. You can run them using `npm run <scriptname>`
| Script name | Description |
|-------------|-------------|
| `build:ts` | Compile the TypeScript sources. |
| `watch:ts` | Compile the TypeScript sources and watch for changes. |
| `watch` | Shortcut for `npm run watch:ts` |
| `test:ts` | Executes the tests you defined in `*.test.ts` files. |
| `test:package` | Ensures your `package.json` and `io-package.json` are valid. |
| `test:unit` | Tests the adapter startup with unit tests (fast, but might require module mocks to work). |
| `test:integration` | Tests the adapter startup with an actual instance of ioBroker. |
| `test` | Performs a minimal test run on package files and your tests. |
| `check` | Performs a type-check on your code (without compiling anything). |
| `lint` | Runs `ESLint` to check your code for formatting errors and potential bugs. |
| `release` | Creates a new release, see [`@alcalzone/release-script`](https://github.com/AlCalzone/release-script#usage) for more details. |

### Writing tests
When done right, testing code is invaluable, because it gives you the 
confidence to change your code while knowing exactly if and when 
something breaks. A good read on the topic of test-driven development 
is https://hackernoon.com/introduction-to-test-driven-development-tdd-61a13bc92d92. 
Although writing tests before the code might seem strange at first, but it has very 
clear upsides.

The template provides you with basic tests for the adapter startup and package files.
It is recommended that you add your own tests into the mix.

### Publishing the adapter
Using GitHub Actions, you can enable automatic releases on npm whenever you push a new git tag that matches the form 
`v<major>.<minor>.<patch>`. We **strongly recommend** that you do. The necessary steps are described in `.github/workflows/test-and-release.yml`.

Since you installed the release script, you can create a new
release simply by calling:
```bash
npm run release
```
Additional command line options for the release script are explained in the
[release-script documentation](https://github.com/AlCalzone/release-script#command-line).

To get your adapter released in ioBroker, please refer to the documentation 
of [ioBroker.repositories](https://github.com/ioBroker/ioBroker.repositories#requirements-for-adapter-to-get-added-to-the-latest-repository).

### Test the adapter manually with dev-server
Since you set up `dev-server`, you can use it to run, test and debug your adapter.

You may start `dev-server` by calling from your dev directory:
```bash
dev-server watch
```

The ioBroker.admin interface will then be available at http://localhost:9981/

Please refer to the [`dev-server` documentation](https://github.com/ioBroker/dev-server#command-line) for more details.

## Changelog
<!-- ### **WORK IN PROGRESS** -->
### 0.4.0 (2026-11-21)
* (joergoss) deep audit: every meter and battery register cross checked address by address against an independent implementation
* (joergoss) new states: full meter identification (option, version, serial number, address, SunSpec DID and block length), battery SunSpec DID and event logs - all within blocks that are polled anyway
* (joergoss) fix 64 bit writes (JavaScript shift was a no-op); the write path is now covered by a modbus test server including FIFO ordering and exact bytes

### 0.3.0 (2026-11-21)
* (joergoss) admin UI migrated to JSON config: grouped sections, min/max validation, help texts, German/English translations, conditional visibility
* (joergoss) toolchain modernised: typescript 5.9, eslint 9 flat config, @typescript-eslint 8, adapter-core 3.4.3, jsmodbus 5, @types/node 22, @types/iobroker 4
* (joergoss) removed unused generator code and dependencies (tools.ts/axios, gulp, proxyquire)
* (joergoss) CI actions updated (testing-action-check v2)

### 0.2.0 (2026-11-21)
* (joergoss) battery status text mapping including 10 = Power Saving; 6/7 corrected to Preserve Charge/Idle (#11)
* (joergoss) optional export control block 0xF700 (mode, limit_mode, site_limit) (#12)
* (joergoss) periodic re-detection of meters and batteries via redetect_interval_minutes (default 15)
* (joergoss) document that BYD/LG lifetime counters are unreliable at the source, in the data point descriptions too (#10)

### 0.1.1 (2026-11-21)
* (joergoss) fix: do not write states for meters/batteries that are not configured or detected - found on the live system, which logged "no existing object" warnings for every empty slot

### 0.1.0 (2026-11-21)
* (joergoss) fix battery 64 bit lifetime counters and battery status: reversed word order, verified against a real SE10K + BYD capture (#4)
* (joergoss) support meter 1-3 and battery 1-2 from table driven register definitions; battery 1 keeps its historical state ids
* (joergoss) optional power control block 0xF000 (rrcr_state, active_power_limit, cosphi)
* (joergoss) optional automatic detection of meters and batteries from their identification blocks (opt-in for existing instances)
* (joergoss) persistent modbus session instead of reconnecting every second, per-request timeouts, block level fault tolerance (#13)
* (joergoss) control commands are written FIFO; invalid values (Infinity/NaN/not implemented) become null; meaningful ioBroker roles per unit; metadata of existing objects is refreshed
* (joergoss) diagnostics: raw register logging, offline capture decoding, live check tool; dependabot enabled

### 0.0.26 (2026-11-20)
* (joergoss) fix ac.I_AC_Energy_WH: read the scale factor as signed int16 (#1)
* (joergoss) fix adapter lifecycle: clear watchdog and main loop on unload, close sockets on errors and timeouts (#2)
* (joergoss) calm connection logging: real error messages instead of "{}", throttled repeats and exponential backoff while the inverter sleeps at night (#2)
* (joergoss) validate hostname/port/unitId before connecting instead of failing with ERR_MISSING_ARGS every second
* (joergoss) new defaults for fresh instances: port 1502, unitId 1, connection_timeout 5000 ms
* (joergoss) maintenance: CI repaired and running on node 22/24, mocha 11, @iobroker/testing 6, io-package schema (tier, licenseInformation), register level unit tests, repository moved to github.com/joergoss

### 0.0.25 (2022-09-13)
fix I_AC_Energy_WH scaling factor
add connection_timout parameter

### 0.0.24 (2022-06-03)
debug code removed

### 0.0.23 (2022-06-03)
debug code removed

### 0.0.22 (2022-05-31)
fix dc.I_DC_Power unit -> int build

### 0.0.21 (2022-05-31)
fix dc.I_DC_Power unit -> int

### 0.0.20 (2022-05-19)
using adapterConfig for com_wait_pause

### 0.0.19 (2022-05-17)
add com_wait_pause config
add main_loop_pause config

### 0.0.18 (2022-05-17)
com_wait_pause = 100 // ms

### 0.0.17 (2022-05-17)
com_wait_pause = 50 // ms

### 0.0.16 (2022-05-02)
edit connection error handling
add timout
reactivate restart after 10 watchdog cycles

### 0.0.15 (2022-04-25)
add connection fail counter
restart adapter

### 0.0.14 (2022-03-29)
add debug log messages and connection lost warning

### 0.0.13 (2022-03-29)
add connection watchdog

### 0.0.12 (2022-03-28)
modbus timing

### 0.0.11 (2022-03-28)
modbus timing

### 0.0.10 (2022-03-21)
fix connection status

### 0.0.9 (2022-03-21)
connection status

### 0.0.8 (2022-03-21)
clean code
update only changed values

### 0.0.7 (2022-03-08)
add first meter model
readHoldingRegisterBlock lenght +1 -> letztes Byte fehlte

### 0.0.6 (2022-02-22)
	change modbus read write logic

### 0.0.5 (2022-02-21)
fix build files

### 0.0.4 (2022-02-21)
fix initObjects

### 0.0.3 (2022-02-21)
extend data model with states

### 0.0.2 (2022-02-17)
* (joergoss) initial release

## License
MIT License

Copyright (c) 2022 joergoss <joerg.oss@gmx.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.