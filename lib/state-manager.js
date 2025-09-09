'use strict';

/**
 * State management utilities for ZeroPV adapter
 */
class StateManager {
    /**
     * Create all adapter states for power monitoring
     * @param {Object} adapter - The adapter instance
     * @param {Array} inverters - Array of inverter configurations
     * @param {Function} getInverterDisplayName - Function to get inverter display names
     */
    static async createStatesAsync(adapter, inverters, getInverterDisplayName) {
        await adapter.setObjectNotExistsAsync('gridPower', {
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

        await adapter.setObjectNotExistsAsync('feedingIn', {
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

        await adapter.setObjectNotExistsAsync('currentPowerLimit', {
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

        await adapter.setObjectNotExistsAsync('powerControlActive', {
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
        for (let i = 0; i < inverters.length; i++) {
            const inverter = inverters[i];
            const inverterName = await getInverterDisplayName(inverter.inverterObject, i);
            
            await adapter.setObjectNotExistsAsync(`inverter${i}.powerLimit`, {
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
}

module.exports = StateManager;