'use strict';

/*
 * Created with @iobroker/create-adapter v2.6.5
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');

// Load your modules here, e.g.:
// const fs = require("fs");
const PowerCalculator = require('./lib/power-calculator');
const InverterManager = require('./lib/inverter-manager');
const ConfigValidator = require('./lib/config-validator');
const ObjectFilter = require('./lib/object-filter');
const StateManager = require('./lib/state-manager');

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
        this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
        
        this.pollingTimer = null;
        this.lastDecreaseTime = null; // timestamp of last power decrease
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        this.log.info('ZeroPV adapter starting...');

        // Reset the connection indicator during startup
        await this.setState('info.connection', false, true);

        // Validate configuration
        const validationResult = ConfigValidator.validateAndNormalize(this.config, this.log);
        if (!validationResult.isValid) {
            for (const error of validationResult.errors) {
                this.log.error(error);
            }
            return;
        }

        this.log.info(`Power source: ${this.config.powerSourceObject}`);
        this.log.info(`Number of inverters: ${this.config.inverters.length}`);
        for (let i = 0; i < this.config.inverters.length; i++) {
            const inv = this.config.inverters[i];
            const displayName = await this.getInverterDisplayName(inv.inverterObject, i);
            this.log.info(`Inverter ${i + 1} (${displayName}): ${inv.inverterObject}`);
        }
        this.log.info(`Polling interval: ${this.config.pollingInterval}ms`);
        this.log.info(`Inverter limit change threshold: ${this.config.feedInThreshold}W`);
        this.log.info(`Maximum grid export: ${this.config.targetFeedIn}W`);

        // Create adapter states
        await StateManager.createStatesAsync(
            this, 
            this.config.inverters, 
            this.getInverterDisplayName.bind(this)
        );

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
     * Handle messages from admin UI for object selection
     * @param {ioBroker.Message} obj
     */
    onMessage(obj) {
        if (typeof obj === 'object' && obj.message) {
            if (obj.command === 'getObjects') {
                this.handleGetObjects(obj);
            }
        }
    }

    /**
     * Handle getObjects command for selectSendTo components
     * @param {ioBroker.Message} obj
     */
    async handleGetObjects(obj) {
        try {
            const criteria = obj.message;
            let filter = {};
            
            if (criteria && typeof criteria === 'string') {
                filter = JSON.parse(criteria);
            } else if (criteria && typeof criteria === 'object') {
                filter = criteria;
            }

            this.log.info(`getObjects called with filter: ${JSON.stringify(filter)}`);

            // Get all objects - need to get both states and devices
            const allObjects = await this.getForeignObjectsAsync('*', 'state');
            const allDevices = await this.getForeignObjectsAsync('*', 'device');
            
            // Merge both results
            Object.assign(allObjects, allDevices);
            
            // Filter objects using ObjectFilter utility
            const result = ObjectFilter.filterObjects(allObjects, filter, this.log);
            
            this.log.info(`Found ${result.length} matching objects for filter`);

            if (obj.callback) {
                this.log.info(`Sending result with ${result.length} items: ${JSON.stringify(result.slice(0, 2))}...`);
                this.sendTo(obj.from, obj.command, result, obj.callback);
            }
        } catch (error) {
            this.log.error(`Error in handleGetObjects: ${error.message}`);
            if (obj.callback) {
                this.sendTo(obj.from, obj.command, { error: error.message }, obj.callback);
            }
        }
    }

    /**
     * Get the display name for an inverter from OpenDTU
     * @param {string} inverterObject - The base inverter object ID
     * @param {number} index - The inverter index for fallback naming
     * @returns {Promise<string>} The display name
     */
    async getInverterDisplayName(inverterObject, index) {
        try {
            const nameState = await this.getForeignStateAsync(`${inverterObject}.name`);
            if (nameState && nameState.val) {
                return nameState.val.toString();
            }
        } catch (error) {
            this.log.debug(`Could not get name for inverter ${inverterObject}: ${error.message}`);
        }
        return `Inverter ${index + 1}`;
    }

    /**
     * Check if a power state is relevant for grid power monitoring
     * @param {string} id - The object ID
     * @param {object} objData - The object data
     * @returns {boolean} Whether this is a relevant power source
     */
    isRelevantPowerSource(id, objData) {
        return ObjectFilter.isRelevantPowerSource(id, objData);
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
     * Calculate new clamped power limits for all inverters
     * @param {number} currentGridPower Current grid power (negative = feeding in)
     * @param {Array<{index: number, inverterObject: string, controlObject: string, value: number}>} currentLimits Current inverter limits
     * @returns {{newLimits: Array<{index: number, controlObject: string, oldValue: number, newValue: number}>, totalOldLimit: number, totalNewLimit: number}}
     */
    calculateNewClampedLimits(currentGridPower, currentLimits) {
        return PowerCalculator.calculateNewClampedLimits(currentGridPower, currentLimits, this.config);
    }

    /**
     * Check if power control adjustment is needed based on calculated inverter limit change
     * @param {number} currentGridPower Current grid power (negative = feeding in)
     */
    async checkPowerControlAdjustment(currentGridPower) {
        try {
            // Get current limits from all inverters
            const currentLimits = await this.getAllInverterLimits();
            if (currentLimits.length === 0) {
                this.log.warn('Could not read current power limits from any inverters');
                return;
            }

            // Calculate new clamped limits and actual total change
            const { newLimits, totalOldLimit, totalNewLimit } = this.calculateNewClampedLimits(currentGridPower, currentLimits);
            
            // Only adjust if actual total limit change (after clamping) is above threshold
            const actualLimitChange = Math.abs(totalNewLimit - totalOldLimit);
            
            if (actualLimitChange >= this.config.feedInThreshold) {
                const isDecrease = totalNewLimit < totalOldLimit;
                const now = Date.now();
                
                // For increases, apply immediately
                if (!isDecrease) {
                    this.log.debug(`Total inverter limit would increase by ${actualLimitChange}W (after clamping), adjusting inverter power limits`);
                    await this.applyInverterPowerLimits(newLimits, totalNewLimit);
                    this.lastDecreaseTime = null; // reset decrease timer on increase
                } else {
                    // For decreases, check if enough time has passed since last decrease
                    const decreaseDelay = this.config.pollingInterval * 3; // 3x polling interval delay
                    
                    if (!this.lastDecreaseTime || (now - this.lastDecreaseTime) >= decreaseDelay) {
                        this.log.debug(`Total inverter limit would decrease by ${actualLimitChange}W (after clamping), adjusting inverter power limits`);
                        await this.applyInverterPowerLimits(newLimits, totalNewLimit);
                        this.lastDecreaseTime = now;
                    } else {
                        const remainingDelay = Math.ceil((decreaseDelay - (now - this.lastDecreaseTime)) / 1000);
                        this.log.debug(`Decrease needed but delaying for ${remainingDelay}s to avoid premature reduction`);
                        await this.setState('powerControlActive', { val: false, ack: true });
                    }
                }
            } else {
                await this.setState('powerControlActive', { val: false, ack: true });
            }
        } catch (error) {
            this.log.error(`Error in power control adjustment: ${error.message}`);
        }
    }

    /**
     * Get current power limits from all configured inverters
     * @returns {Promise<Array<{index: number, inverterObject: string, controlObject: string, value: number}>>}
     */
    async getAllInverterLimits() {
        return await InverterManager.getAllInverterLimits(
            this.config, 
            this.getForeignStateAsync.bind(this), 
            this.log
        );
    }

    /**
     * Apply the calculated power limits to all inverters
     * @param {Array<{index: number, controlObject: string, oldValue: number, newValue: number}>} newLimits New limits to apply
     * @param {number} totalNewLimit Total new power limit across all inverters
     */
    async applyInverterPowerLimits(newLimits, totalNewLimit) {
        try {
            this.log.debug(`Applying new power limits, total: ${totalNewLimit}W`);

            // Set new power limit for each inverter
            const adjustmentPromises = [];
            const changedInverters = [];
            
            const namePromises = [];
            for (const limit of newLimits) {
                const inverter = this.config.inverters[limit.index];
                namePromises.push(this.getInverterDisplayName(inverter.inverterObject, limit.index));
            }
            const inverterNames = await Promise.all(namePromises);
            
            for (let i = 0; i < newLimits.length; i++) {
                const limit = newLimits[i];
                const inverterName = inverterNames[i];
                
                // Only send command if limit actually changed
                if (limit.newValue !== limit.oldValue) {
                    changedInverters.push(`${inverterName}: ${limit.oldValue}W → ${limit.newValue}W`);
                    
                    adjustmentPromises.push(
                        this.setForeignStateAsync(limit.controlObject, limit.newValue)
                            .then(async () => {
                                // Update individual inverter state
                                await this.setState(`inverter${limit.index}.powerLimit`, { val: limit.newValue, ack: true });
                            })
                            .catch(error => {
                                this.log.error(`Error setting limit for ${inverterName}: ${error.message}`);
                            })
                    );
                } else {
                    this.log.debug(`${inverterName} limit unchanged at ${limit.newValue}W, skipping update`);
                }
            }
            
            // Log changes once
            if (changedInverters.length > 0) {
                this.log.info(`Setting inverter limits: ${changedInverters.join(', ')}`);
            }
            
            // Wait for all adjustments to complete
            await Promise.all(adjustmentPromises);
            
            // Update our states
            await this.setState('currentPowerLimit', { val: totalNewLimit, ack: true });
            await this.setState('powerControlActive', { val: true, ack: true });
            
        } catch (error) {
            this.log.error(`Error applying inverter power limits: ${error.message}`);
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