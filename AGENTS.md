# AGENTS.md

This file provides guidance to opencode (opencode.ai) when working with code in this repository.

## Project Overview

This is an ioBroker adapter called "zeropv" that controls photovoltaic inverter output via OpenDTU to reduce grid feed-in. It's built using the standard ioBroker adapter architecture and is currently in initial development phase (v0.0.1).

## Key Commands

### Testing
- `npm test` - Runs both JavaScript tests and package validation
- `npm run test:js` - Runs unit tests for JavaScript files
- `npm run test:package` - Validates package.json and io-package.json files
- `npm run test:integration` - Tests adapter startup with actual ioBroker instance

### Development Tools
- `npm run translate` - Translates adapter texts to all required languages using @iobroker/adapter-dev
- `npm run release` - Creates a new release using @alcalzone/release-script

## Architecture

### Core Files Structure
- **main.js** - Primary adapter implementation extending utils.Adapter
- **io-package.json** - ioBroker adapter configuration and metadata
- **admin/jsonConfig.json** - Admin UI configuration for adapter settings
- **lib/adapter-config.d.ts** - TypeScript type definitions for adapter configuration

### Adapter Implementation
The adapter follows standard ioBroker patterns:
- Extends `@iobroker/adapter-core` utils.Adapter class
- Implements standard lifecycle methods: onReady(), onStateChange(), onUnload()
- Uses daemon mode with local connection type
- Supports compact mode execution
- Configuration managed via native properties in io-package.json

### Configuration
- Configuration includes power source selection, inverter management table, polling interval, feed-in threshold, and target grid export settings
- Multi-language support with i18n translations in admin/i18n/
- Admin UI uses JSON configuration panel

### Testing Framework
- Mocha test runner with custom configuration in test/mocharc.custom.json
- Setup file at test/mocha.setup.js
- Tests include unit tests, package validation, and integration testing
- Test utilities: chai, sinon, proxyquire for mocking

## Development Notes

### Current State
- Implements active power monitoring and inverter control via OpenDTU integration
- Custom modules for power calculation, inverter management, state management, and config validation
- JSON-based admin configuration with selectSendTo components for object selection

### Key Integration Points
- Integrates with OpenDTU API via InverterManager for inverter control
- State management for PV system data and grid feed-in metrics
- Configuration for OpenDTU connection parameters and control thresholds

### Dependencies
- Requires Node.js >= 18
- ioBroker js-controller >= 6.0.11
- Admin >= 7.0.23
