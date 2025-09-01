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
        this.lastPowerLimit = null;
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

        if (!this.config.powerControlObject) {
            this.log.error('No power control object configured!');
            return;
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
        this.log.info(`Power control: ${this.config.powerControlObject}`);
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

            // Calculate what the new inverter limit would be
            const currentLimitState = await this.getForeignStateAsync(this.config.powerControlObject);
            if (!currentLimitState || currentLimitState.val === null || currentLimitState.val === undefined) {
                this.log.warn(`Could not read current power limit from ${this.config.powerControlObject}`);
                this.lastGridPower = currentGridPower;
                return;
            }

            const currentLimit = parseFloat(currentLimitState.val);
            if (isNaN(currentLimit)) {
                this.log.warn(`Invalid power limit value: ${currentLimitState.val}`);
                this.lastGridPower = currentGridPower;
                return;
            }

            // Calculate what the new limit would be
            let newLimit;
            if (currentGridPower >= 0) {
                newLimit = currentLimit + currentGridPower;
            } else {
                const feedInDifference = currentGridPower - this.config.targetFeedIn;
                newLimit = Math.max(0, currentLimit + feedInDifference);
            }

            // Only adjust if inverter limit change is above threshold
            const limitChange = Math.abs(newLimit - currentLimit);
            
            if (limitChange >= this.config.feedInThreshold) {
                this.log.info(`Inverter limit would change by ${limitChange}W, adjusting inverter power limit`);
                await this.adjustInverterPowerLimit(currentGridPower);
            } else {
                await this.setState('powerControlActive', { val: false, ack: true });
            }

            this.lastGridPower = currentGridPower;
        } catch (error) {
            this.log.error(`Error in power control adjustment: ${error.message}`);
        }
    }

    /**
     * Adjust inverter power limit to achieve target feed-in
     * @param {number} currentGridPower Current grid power (negative = feeding in)
     */
    async adjustInverterPowerLimit(currentGridPower) {
        try {
            // Get current power limit from OpenDTU
            const currentLimitState = await this.getForeignStateAsync(this.config.powerControlObject);
            
            if (!currentLimitState || currentLimitState.val === null || currentLimitState.val === undefined) {
                this.log.warn(`Could not read current power limit from ${this.config.powerControlObject}`);
                return;
            }

            const currentLimit = parseFloat(currentLimitState.val);
            if (isNaN(currentLimit)) {
                this.log.warn(`Invalid power limit value: ${currentLimitState.val}`);
                return;
            }

            // Calculate the adjustment needed
            // For positive grid power (consuming): increase PV limit to reduce consumption
            // For negative grid power (feeding): adjust to reach target feed-in
            let newLimit;
            if (currentGridPower >= 0) {
                // Consuming from grid - increase PV production
                newLimit = currentLimit + currentGridPower;
            } else {
                // Feeding into grid - adjust to reach target feed-in
                const feedInDifference = currentGridPower - this.config.targetFeedIn;
                newLimit = Math.max(0, currentLimit + feedInDifference);
            }

            this.log.info(`Adjusting power limit from ${currentLimit}W to ${newLimit}W (grid power: ${currentGridPower}W, target: ${this.config.targetFeedIn}W)`);

            // Set new power limit
            await this.setForeignStateAsync(this.config.powerControlObject, newLimit);
            
            // Update our states
            await this.setState('currentPowerLimit', { val: newLimit, ack: true });
            await this.setState('powerControlActive', { val: true, ack: true });
            
            this.lastPowerLimit = newLimit;
        } catch (error) {
            this.log.error(`Error adjusting inverter power limit: ${error.message}`);
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