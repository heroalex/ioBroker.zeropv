'use strict';

/**
 * Configuration validation utilities for ZeroPV adapter
 */
class ConfigValidator {
    /**
     * Validate and normalize adapter configuration
     * @param {Object} config Raw configuration from adapter
     * @param {Object} logger Logger instance
     * @returns {Object} Validated and normalized configuration
     */
    static validateAndNormalize(config, logger) {
        const result = { isValid: true, errors: [] };

        // Validate power source object
        if (!config.powerSourceObject) {
            result.errors.push('No power source object configured!');
            result.isValid = false;
        }

        // Validate inverters
        if (!config.inverters || !Array.isArray(config.inverters) || config.inverters.length === 0) {
            result.errors.push('No inverters configured!');
            result.isValid = false;
        } else {
            // Validate each inverter configuration
            for (let i = 0; i < config.inverters.length; i++) {
                const inverter = config.inverters[i];
                if (!inverter.inverterObject) {
                    result.errors.push(`Inverter ${i + 1} has no inverter base object configured!`);
                    result.isValid = false;
                }
                
                // Validate and enforce maximum power limit
                if (inverter.maxPower === undefined || inverter.maxPower === null) {
                    inverter.maxPower = 2250;
                    logger.warn(`Inverter ${i + 1} has no max power configured, using default 2250W`);
                } else if (inverter.maxPower > 2250) {
                    inverter.maxPower = 2250;
                    logger.warn(`Inverter ${i + 1} max power exceeded 2250W limit, clamped to 2250W`);
                } else if (inverter.maxPower < 0) {
                    inverter.maxPower = 2250;
                    logger.warn(`Inverter ${i + 1} has invalid max power, using default 2250W`);
                }
            }
        }

        // Validate polling interval
        if (!config.pollingInterval || config.pollingInterval < 1000) {
            logger.warn('Invalid polling interval, using default of 10000ms');
            config.pollingInterval = 10000;
        }

        // Validate feed-in threshold
        if (!config.feedInThreshold || config.feedInThreshold < 50) {
            logger.warn('Invalid inverter limit change threshold, using default of 100W');
            config.feedInThreshold = 100;
        }

        // Validate target feed-in
        if (config.targetFeedIn === undefined || config.targetFeedIn === null || config.targetFeedIn < 0) {
            logger.warn('Invalid maximum grid export, using default of 800W');
            config.targetFeedIn = 800;
        }

        return result;
    }
}

module.exports = ConfigValidator;