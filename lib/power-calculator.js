'use strict';

/**
 * Power calculation utilities for ZeroPV adapter
 */
class PowerCalculator {
    /**
     * Calculate new clamped power limits for all inverters
     * @param {number} currentGridPower Current grid power (negative = feeding in)
     * @param {Array<{index: number, inverterObject: string, controlObject: string, value: number}>} currentLimits Current inverter limits
     * @param {Object} config Adapter configuration
     * @returns {{newLimits: Array<{index: number, controlObject: string, oldValue: number, newValue: number}>, totalOldLimit: number, totalNewLimit: number}}
     */
    static calculateNewClampedLimits(currentGridPower, currentLimits, config) {
        // Calculate total current limit
        const totalOldLimit = currentLimits.reduce((sum, limit) => sum + limit.value, 0);

        // Calculate the adjustment needed
        let newTotalLimit;
        if (currentGridPower >= 0) {
            // Consuming from grid - increase PV production to reach target feed-in
            newTotalLimit = totalOldLimit + currentGridPower + config.targetFeedIn;
        } else {
            // Feeding into grid - adjust to reach target feed-in
            const excessFeedIn = -currentGridPower - config.targetFeedIn;
            newTotalLimit = Math.max(0, totalOldLimit - excessFeedIn);
        }

        // Distribute the new total limit equally among all inverters
        const newLimitPerInverter = Math.floor(newTotalLimit / config.inverters.length);
        
        // Calculate clamped limits for each inverter
        const newLimits = [];
        let totalNewLimit = 0;
        
        for (const limit of currentLimits) {
            const inverter = config.inverters[limit.index];
            // Enforce maximum power limit per inverter
            const clampedLimit = Math.min(newLimitPerInverter, inverter.maxPower || 2250);
            
            newLimits.push({
                index: limit.index,
                controlObject: limit.controlObject,
                oldValue: limit.value,
                newValue: clampedLimit
            });
            
            totalNewLimit += clampedLimit;
        }

        return {
            newLimits,
            totalOldLimit,
            totalNewLimit
        };
    }
}

module.exports = PowerCalculator;