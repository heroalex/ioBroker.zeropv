'use strict';

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
// const fs = require("fs");

class Zeropv extends utils.Adapter {

    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'zeropv',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        // this.on('objectChange', this.onObjectChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
        
        this.pollingTimer = null;
        this.lastGridPower = null;
        this.lastPowerLimits = new Map();
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        this.log.info('ZeroPV adapter starting...');

        // Reset the connection indicator during startup
        await this.setState('info.connection', false, true);

        // Validate configuration
        if (!this.config.powerSourceObject) {
            this.log.error('No power source object configured!');
            return;
        }

        if (!this.config.inverters || !Array.isArray(this.config.inverters) || this.config.inverters.length === 0) {
            this.log.error('No inverters configured!');
            return;
        }

        // Validate each inverter configuration
        for (let i = 0; i < this.config.inverters.length; i++) {
            const inverter = this.config.inverters[i];
            if (!inverter.powerControlObject) {
                this.log.error(`Inverter ${i + 1} has no power control object configured!`);
                return;
            }
            
            // Validate and enforce maximum power limit
            if (inverter.maxPower === undefined || inverter.maxPower === null) {
                inverter.maxPower = 2250;
                this.log.warn(`Inverter ${i + 1} has no max power configured, using default 2250W`);
            } else if (inverter.maxPower > 2250) {
                inverter.maxPower = 2250;
                this.log.warn(`Inverter ${i + 1} max power exceeded 2250W limit, clamped to 2250W`);
            } else if (inverter.maxPower < 0) {
                inverter.maxPower = 2250;
                this.log.warn(`Inverter ${i + 1} has invalid max power, using default 2250W`);
            }
        }

        if (!this.config.pollingInterval || this.config.pollingInterval < 1000) {
            this.log.warn('Invalid polling interval, using default of 5000ms');
            this.config.pollingInterval = 5000;
        }

        if (!this.config.feedInThreshold || this.config.feedInThreshold < 50) {
            this.log.warn('Invalid inverter limit change threshold, using default of 100W');
            this.config.feedInThreshold = 100;
        }

        if (this.config.targetFeedIn === undefined || this.config.targetFeedIn === null) {
            this.log.warn('Invalid target feed-in, using default of -800W');
            this.config.targetFeedIn = -800;
        }

        this.log.info(`Power source: ${this.config.powerSourceObject}`);
        this.log.info(`Number of inverters: ${this.config.inverters.length}`);
        this.config.inverters.forEach((inv, index) => {
            this.log.info(`Inverter ${index + 1} (${inv.name || 'Unnamed'}): ${inv.powerControlObject}`);
        });
        this.log.info(`Polling interval: ${this.config.pollingInterval}ms`);
        this.log.info(`Inverter limit change threshold: ${this.config.feedInThreshold}W`);
        this.log.info(`Target feed-in: ${this.config.targetFeedIn}W`);

        // Create adapter states
        await this.createStatesAsync();

        // Start power monitoring
        this.startPowerMonitoring();

        await this.setState('info.connection', true, true);
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            if (this.pollingTimer) {
                clearTimeout(this.pollingTimer);
                this.pollingTimer = null;
            }
            this.log.info('ZeroPV adapter stopped');
            callback();
        } catch (e) {
            callback();
        }
    }

    // If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
    // You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
    // /**
    //  * Is called if a subscribed object changes
    //  * @param {string} id
    //  * @param {ioBroker.Object | null | undefined} obj
    //  */
    // onObjectChange(id, obj) {
    //     if (obj) {
    //         // The object was changed
    //         this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
    //     } else {
    //         // The object was deleted
    //         this.log.info(`object ${id} deleted`);
    //     }
    // }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }

    // If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
    // /**
    //  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
    //  * Using this method requires "common.messagebox" property to be set to true in io-package.json
    //  * @param {ioBroker.Message} obj
    //  */
    // onMessage(obj) {
    //     if (typeof obj === 'object' && obj.message) {
    //         if (obj.command === 'send') {
    //             // e.g. send email or pushover or whatever
    //             this.log.info('send command');

    //             // Send response in callback if required
    //             if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
    //         }
    //     }
    // }

    /**
     * Create adapter states for power monitoring
     */
    async createStatesAsync() {
        await this.setObjectNotExistsAsync('gridPower', {
            type: 'state',
            common: {
                name: 'Grid power (+ = import, - = export)',
                type: 'number',
                role: 'value.power',
                read: true,
                write: false,
                unit: 'W'
            },
            native: {}
        });

        await this.setObjectNotExistsAsync('feedingIn', {
            type: 'state',
            common: {
                name: 'Feeding into grid',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
                def: false
            },
            native: {}
        });

        await this.setObjectNotExistsAsync('currentPowerLimit', {
            type: 'state',
            common: {
                name: 'Current inverter power limit',
                type: 'number',
                role: 'value.power',
                read: true,
                write: false,
                unit: 'W'
            },
            native: {}
        });

        await this.setObjectNotExistsAsync('powerControlActive', {
            type: 'state',
            common: {
                name: 'Power control is active',
                type: 'boolean',
                role: 'indicator',
                read: true,
                write: false,
                def: false
            },
            native: {}
        });

        // Create states for each inverter
        for (let i = 0; i < this.config.inverters.length; i++) {
            const inverter = this.config.inverters[i];
            const inverterName = inverter.name || `Inverter ${i + 1}`;
            
            await this.setObjectNotExistsAsync(`inverter${i}.powerLimit`, {
                type: 'state',
                common: {
                    name: `${inverterName} power limit`,
                    type: 'number',
                    role: 'value.power',
                    read: true,
                    write: false,
                    unit: 'W'
                },
                native: {}
            });
        }
    }

    /**
     * Start periodic power monitoring
     */
    startPowerMonitoring() {
        this.log.info('Starting power monitoring...');
        this.pollPowerData().catch(err => this.log.error(`Error in pollPowerData: ${err.message}`));
    }

    /**
     * Poll power data from configured source
     */
    async pollPowerData() {
        try {
            const powerState = await this.getForeignStateAsync(this.config.powerSourceObject);
            
            if (powerState && powerState.val !== null && powerState.val !== undefined) {
                const powerValue = parseFloat(powerState.val);
                
                if (!isNaN(powerValue)) {
                    await this.setState('gridPower', { val: powerValue, ack: true });
                    
                    const isFeedingIn = powerValue < 0;
                    await this.setState('feedingIn', { val: isFeedingIn, ack: true });
                    
                    this.log.debug(`Grid power: ${powerValue}W, Feeding in: ${isFeedingIn}`);
                    
                    // Check if power control adjustment is needed
                    await this.checkPowerControlAdjustment(powerValue);
                } else {
                    this.log.warn(`Invalid power value from ${this.config.powerSourceObject}: ${powerState.val}`);
                }
            } else {
                this.log.warn(`No data received from ${this.config.powerSourceObject}`);
            }
        } catch (error) {
            this.log.error(`Error reading power data: ${error.message}`);
        }

        this.pollingTimer = setTimeout(() => {
            this.pollPowerData();
        }, this.config.pollingInterval);
    }

    /**
     * Check if power control adjustment is needed based on calculated inverter limit change
     * @param {number} currentGridPower Current grid power (negative = feeding in)
     */
    async checkPowerControlAdjustment(currentGridPower) {
        try {
            // Check if this is the first reading
            if (this.lastGridPower === null) {
                this.lastGridPower = currentGridPower;
                return;
            }

            // Get current limits from all inverters
            const currentLimits = await this.getAllInverterLimits();
            if (currentLimits.length === 0) {
                this.log.warn('Could not read current power limits from any inverters');
                this.lastGridPower = currentGridPower;
                return;
            }

            // Calculate total current limit
            const totalCurrentLimit = currentLimits.reduce((sum, limit) => sum + limit.value, 0);

            // Calculate what the new total limit would be
            let newTotalLimit;
            if (currentGridPower >= 0) {
                newTotalLimit = totalCurrentLimit + currentGridPower;
            } else {
                const feedInDifference = currentGridPower - this.config.targetFeedIn;
                newTotalLimit = Math.max(0, totalCurrentLimit + feedInDifference);
            }

            // Only adjust if total limit change is above threshold
            const limitChange = Math.abs(newTotalLimit - totalCurrentLimit);
            
            if (limitChange >= this.config.feedInThreshold) {
                this.log.info(`Total inverter limit would change by ${limitChange}W, adjusting inverter power limits`);
                await this.adjustInverterPowerLimits(currentGridPower, currentLimits);
            } else {
                await this.setState('powerControlActive', { val: false, ack: true });
            }

            this.lastGridPower = currentGridPower;
        } catch (error) {
            this.log.error(`Error in power control adjustment: ${error.message}`);
        }
    }

    /**
     * Get current power limits from all configured inverters
     * @returns {Promise<Array<{index: number, powerControlObject: string, value: number}>>}
     */
    async getAllInverterLimits() {
        const limits = [];
        
        for (let i = 0; i < this.config.inverters.length; i++) {
            const inverter = this.config.inverters[i];
            try {
                const limitState = await this.getForeignStateAsync(inverter.powerControlObject);
                
                if (limitState && limitState.val !== null && limitState.val !== undefined) {
                    const limitValue = parseFloat(limitState.val);
                    if (!isNaN(limitValue)) {
                        limits.push({
                            index: i,
                            powerControlObject: inverter.powerControlObject,
                            value: limitValue
                        });
                    } else {
                        this.log.warn(`Invalid power limit value from inverter ${i + 1}: ${limitState.val}`);
                    }
                } else {
                    this.log.warn(`Could not read power limit from inverter ${i + 1}: ${inverter.powerControlObject}`);
                }
            } catch (error) {
                this.log.error(`Error reading limit from inverter ${i + 1}: ${error.message}`);
            }
        }
        
        return limits;
    }

    /**
     * Adjust inverter power limits to achieve target feed-in, distributing power equally
     * @param {number} currentGridPower Current grid power (negative = feeding in)
     * @param {Array<{index: number, powerControlObject: string, value: number}>} currentLimits Current inverter limits
     */
    async adjustInverterPowerLimits(currentGridPower, currentLimits) {
        try {
            // Calculate total current limit
            const totalCurrentLimit = currentLimits.reduce((sum, limit) => sum + limit.value, 0);

            // Calculate the adjustment needed
            let newTotalLimit;
            if (currentGridPower >= 0) {
                // Consuming from grid - increase PV production
                newTotalLimit = totalCurrentLimit + currentGridPower;
            } else {
                // Feeding into grid - adjust to reach target feed-in
                const feedInDifference = currentGridPower - this.config.targetFeedIn;
                newTotalLimit = Math.max(0, totalCurrentLimit + feedInDifference);
            }

            // Distribute the new total limit equally among all inverters
            const newLimitPerInverter = Math.floor(newTotalLimit / this.config.inverters.length);
            
            this.log.info(`Adjusting total power limit from ${totalCurrentLimit}W to ${newTotalLimit}W (${newLimitPerInverter}W per inverter) - grid power: ${currentGridPower}W, target: ${this.config.targetFeedIn}W`);

            // Set new power limit for each inverter
            const adjustmentPromises = [];
            for (const limit of currentLimits) {
                const inverter = this.config.inverters[limit.index];
                const inverterName = inverter.name || `Inverter ${limit.index + 1}`;
                
                // Enforce maximum power limit per inverter
                const clampedLimit = Math.min(newLimitPerInverter, inverter.maxPower || 2250);
                
                if (clampedLimit !== newLimitPerInverter) {
                    this.log.warn(`${inverterName} limit clamped from ${newLimitPerInverter}W to ${clampedLimit}W (max: ${inverter.maxPower || 2250}W)`);
                }
                
                this.log.debug(`Setting ${inverterName} limit from ${limit.value}W to ${clampedLimit}W`);
                
                adjustmentPromises.push(
                    this.setForeignStateAsync(limit.powerControlObject, clampedLimit)
                        .then(async () => {
                            this.lastPowerLimits.set(limit.index, clampedLimit);
                            // Update individual inverter state
                            await this.setState(`inverter${limit.index}.powerLimit`, { val: clampedLimit, ack: true });
                        })
                        .catch(error => {
                            this.log.error(`Error setting limit for ${inverterName}: ${error.message}`);
                        })
                );
            }
            
            // Wait for all adjustments to complete
            await Promise.all(adjustmentPromises);
            
            // Update our states
            await this.setState('currentPowerLimit', { val: newTotalLimit, ack: true });
            await this.setState('powerControlActive', { val: true, ack: true });
            
        } catch (error) {
            this.log.error(`Error adjusting inverter power limits: ${error.message}`);
        }
    }

}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Zeropv(options);
} else {
    // otherwise start the instance directly
    new Zeropv();
}