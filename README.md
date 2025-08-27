![Logo](admin/zeropv.png)
# ioBroker.zeropv

[![NPM version](https://img.shields.io/npm/v/iobroker.zeropv.svg)](https://www.npmjs.com/package/iobroker.zeropv)
[![Downloads](https://img.shields.io/npm/dm/iobroker.zeropv.svg)](https://www.npmjs.com/package/iobroker.zeropv)
![Number of Installations](https://iobroker.live/badges/zeropv-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/zeropv-stable.svg)

[![NPM](https://nodei.co/npm/iobroker.zeropv.png?downloads=true)](https://nodei.co/npm/iobroker.zeropv/)

**Tests:** ![Test and Release](https://github.com/heroalex/ioBroker.zeropv/workflows/Test%20and%20Release/badge.svg)

## zeropv adapter for ioBroker

Controls photovoltaic inverter output via OpenDTU to reduce grid feed-in by automatically adjusting power limits based on current power consumption and feed-in levels.

## Features

- **Smart Feed-in Control**: Automatically adjusts inverter power output to maintain target grid feed-in levels
- **Configurable Thresholds**: Set custom feed-in thresholds and target power levels
- **Real-time Monitoring**: Continuously monitors grid power and inverter status
- **Multi-language Support**: Available in 11 languages
- **Integration Ready**: Works with existing energy meters (Shelly, etc.) and OpenDTU adapters

## Configuration

### Required Settings

1. **Power Source Object**: Select the ioBroker state containing power data from your energy meter (usually negative for export, positive for import)
2. **OpenDTU Power Control Object**: Select the OpenDTU power limit control state for your inverter
3. **Polling Interval**: How often to check power data (1000-300000ms, default: 5000ms)
4. **Feed-in Change Threshold**: Minimum power change to trigger adjustments (50-1000W, default: 100W)  
5. **Target Feed-in Power**: Desired grid feed-in level (negative value, default: -800W)

### How It Works

1. The adapter monitors your power meter data at the configured interval
2. When grid feed-in changes by more than the threshold, it calculates a new inverter power limit
3. The new limit is set on your OpenDTU to achieve the target feed-in level
4. Power control is only active during feed-in situations (negative grid power)

## Prerequisites

- ioBroker installation with Admin >= 7.0.23
- Energy meter adapter (e.g., Shelly) providing power data
- OpenDTU adapter for inverter control
- Node.js >= 18

## States

The adapter creates the following states:

- **info.connection**: Connection status to configured data sources
- **gridPower**: Current grid power (+ = import, - = export) in Watts
- **feedingIn**: Boolean indicating if currently feeding into grid
- **currentPowerLimit**: Current inverter power limit in Watts
- **powerControlActive**: Boolean indicating if power control is currently active

## Developer manual

### DISCLAIMER

Please make sure that you consider copyrights and trademarks when you use names or logos of a company and add a disclaimer to your README.
You can check other adapters for examples or ask in the developer community. Using a name or logo of a company without permission may cause legal problems for you.

### Getting started

You are almost done, only a few steps left:
1. Create a new repository on GitHub with the name `ioBroker.zeropv`

1. Push all files to the GitHub repo. The creator has already set up the local repository for you:  
    ```bash
    git push origin master
    ```
1. Add a new secret under https://github.com/heroalex/ioBroker.zeropv/settings/secrets. It must be named `AUTO_MERGE_TOKEN` and contain a personal access token with push access to the repository, e.g. yours. You can create a new token under https://github.com/settings/tokens.

1. Head over to [main.js](main.js) and start programming!

### Best Practices
We've collected some [best practices](https://github.com/ioBroker/ioBroker.repositories#development-and-coding-best-practices) regarding ioBroker development and coding in general. If you're new to ioBroker or Node.js, you should
check them out. If you're already experienced, you should also take a look at them - you might learn something new :)

### Running Tests
Several test commands are available:

| Command | Description |
|---------|-------------|
| `npm run test:package` | Validates package.json and io-package.json files |
| `npm run test:integration` | Tests adapter startup with actual ioBroker instance |

For running unit tests, use:
```bash
# Run comprehensive unit tests for adapter functionality
npx mocha test/unit.js --require test/mocha.setup.js
```

**Note**: The template test file `main.test.js` has been removed due to Chai ES module compatibility issues. All functional tests are in `test/unit.js`.

### Scripts in `package.json`
Additional npm scripts are predefined for your convenience. You can run them using `npm run <scriptname>`
| Script name | Description |
|-------------|-------------|
| `translate` | Translates texts in your adapter to all required languages, see [`@iobroker/adapter-dev`](https://github.com/ioBroker/adapter-dev#manage-translations) for more details. |
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

The ioBroker.admin interface will then be available at http://localhost:8081/

Please refer to the [`dev-server` documentation](https://github.com/ioBroker/dev-server#command-line) for more details.

## Changelog
<!--
    Placeholder for the next version (at the beginning of the line):
    ### **WORK IN PROGRESS**
-->

### **WORK IN PROGRESS**
* (heroalex) initial release