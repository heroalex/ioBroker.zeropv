'use strict';

/**
 * Inverter management utilities for ZeroPV adapter
 */
class InverterManager {
    /**
     * Get current power limits from all configured inverters
     * @param {Object} config Adapter configuration
     * @param {Function} getForeignStateAsync Function to get foreign state
     * @param {Object} logger Logger instance
     * @returns {Promise<Array<{index: number, inverterObject: string, controlObject: string, value: number}>>}
     */
    static async getAllInverterLimits(config, getForeignStateAsync, logger) {
        const limits = [];
        
        for (let i = 0; i < config.inverters.length; i++) {
            const inverter = config.inverters[i];
            try {
                const currentLimitObject = `${inverter.inverterObject}.power_control.current_limit_absolute`;
                const limitState = await getForeignStateAsync(currentLimitObject);
                
                if (limitState && limitState.val !== null && limitState.val !== undefined) {
                    const limitValue = parseFloat(limitState.val);
                    if (!isNaN(limitValue)) {
                        limits.push({
                            index: i,
                            inverterObject: inverter.inverterObject,
                            controlObject: `${inverter.inverterObject}.power_control.limit_nonpersistent_absolute`,
                            value: limitValue
                        });
                    } else {
                        logger.warn(`Invalid power limit value from inverter ${i + 1}: ${limitState.val}`);
                    }
                } else {
                    logger.warn(`Could not read power limit from inverter ${i + 1}: ${currentLimitObject}`);
                }
            } catch (error) {
                logger.error(`Error reading limit from inverter ${i + 1}: ${error.message}`);
            }
        }
        
        return limits;
    }

    /**
     * Power off all configured inverters
     * @param {Object} config Adapter configuration
     * @param {Function} setForeignStateAsync Function to set foreign state
     * @param {Object} logger Logger instance
     */
    static async powerOffAllInverters(config, setForeignStateAsync, logger) {
        for (const inverter of config.inverters) {
            try {
                await setForeignStateAsync(`${inverter.inverterObject}.power_control.power_off`, true);
                logger.info(`Powered off inverter: ${inverter.inverterObject}`);
            } catch (error) {
                logger.error(`Error powering off ${inverter.inverterObject}: ${error.message}`);
            }
        }
    }

    /**
     * Power on all configured inverters
     * @param {Object} config Adapter configuration
     * @param {Function} setForeignStateAsync Function to set foreign state
     * @param {Object} logger Logger instance
     */
    static async powerOnAllInverters(config, setForeignStateAsync, logger) {
        for (const inverter of config.inverters) {
            try {
                await setForeignStateAsync(`${inverter.inverterObject}.power_control.power_on`, true);
                logger.info(`Powered on inverter: ${inverter.inverterObject}`);
            } catch (error) {
                logger.error(`Error powering on ${inverter.inverterObject}: ${error.message}`);
            }
        }
    }
}

module.exports = InverterManager;