'use strict';

/**
 * Object filtering utilities for ZeroPV adapter
 */
class ObjectFilter {
    /**
     * Check if a power state is relevant for grid power monitoring
     * @param {string} id - The object ID
     * @param {object} objData - The object data
     * @returns {boolean} Whether this is a relevant power source
     */
    static isRelevantPowerSource(id, objData) {
        // Exclude OpenDTU inverter power states (we don't want to monitor our own inverters)
        if (id.toLowerCase().includes('opendtu')) {
            return false;
        }

        // Exclude individual phase/input power measurements - we want total power
        const excludePatterns = [
            /\.phase_\d+\./,          // AC phase power (opendtu.0.xxxxx.ac.phase_1.power)
            /\.input_\d+\./,          // DC input power (opendtu.0.xxxxx.dc.input_1.power)
            /\.ApparentPower[ABC]$/,  // Individual phase apparent power (Shelly)
            /\.ReactivePower[ABC]$/,  // Individual phase reactive power (Shelly)
            /\.ActivePower[ABC]$/,    // Individual phase active power (Shelly)
            /\.power_dc$/,            // DC power from inverters
        ];

        for (const pattern of excludePatterns) {
            if (pattern.test(id)) {
                return false;
            }
        }

        // Include total/main power measurements
        const includePatterns = [
            /TotalActivePower$/,      // Shelly total active power
            /TotalApparentPower$/,    // Shelly total apparent power  
            /\.total\.power$/,        // OpenDTU total power (if we ever want it)
            /gridPower$/,             // Our own grid power state
            /totalPower$/,            // Generic total power
            /activePower$/,           // Main active power (but not phase-specific)
        ];

        for (const pattern of includePatterns) {
            if (pattern.test(id)) {
                return true;
            }
        }

        // For other power states, be more selective
        const name = objData.common.name;
        if (typeof name === 'string') {
            const lowerName = name.toLowerCase();
            // Include if it contains "total" or "grid" or "main" but not "phase" or "input"
            if ((lowerName.includes('total') || lowerName.includes('grid') || lowerName.includes('main')) 
                && !lowerName.includes('phase') && !lowerName.includes('input')) {
                return true;
            }
        }

        return false;
    }

    /**
     * Filter objects based on criteria for selectSendTo components
     * @param {Object} allObjects - All objects to filter from
     * @param {Object} filter - Filter criteria
     * @param {Object} logger - Logger instance
     * @returns {Array} Filtered objects
     */
    static filterObjects(allObjects, filter, logger) {
        const result = [];

        for (const [id, objData] of Object.entries(allObjects)) {
            if (!objData || !objData.common) continue;

            let matches = false;

            // Handle power source objects (states with power-related roles)
            if (filter.type === 'state' && filter.role === 'value.power') {
                const role = objData.common.role;
                const isPowerRole = role === 'value.power' || role === 'value.power.active' || role === 'value.power.apparent';
                
                if (objData.type === 'state' && isPowerRole) {
                    // Only include relevant power sources for grid monitoring
                    matches = ObjectFilter.isRelevantPowerSource(id, objData);
                    if (matches) {
                        logger.debug(`Including power source: ${id} (role: ${role})`);
                    } else {
                        logger.debug(`Excluding power source: ${id} (role: ${role})`);
                    }
                }
            }
            
            // Handle OpenDTU device objects
            else if (filter.type === 'device' && filter.name === '*opendtu*') {
                if (id.toLowerCase().includes('opendtu')) {
                    logger.debug(`Checking OpenDTU object: ${id}, type: ${objData.type}`);
                    if (objData.type === 'device') {
                        // Look for inverter device objects (pattern: opendtu.0.123456789)
                        if (id.match(/^opendtu\.\d+\.\d+$/)) {
                            logger.debug(`Found OpenDTU device match: ${id}`);
                            matches = true;
                        }
                    }
                }
            }

            if (matches) {
                // Handle display name properly
                let displayName = objData.common.name;
                if (typeof displayName === 'object') {
                    displayName = displayName.en || displayName.de || displayName.toString();
                }
                if (!displayName || displayName === '[object Object]') {
                    displayName = id;
                }
                
                result.push({
                    _id: id,
                    common: {
                        name: displayName
                    },
                    value: id,
                    label: displayName
                });
                
                logger.debug(`Added object: ${id} (${displayName})`);
            }
        }

        // Sort results by display name
        result.sort((a, b) => {
            const nameA = (a.common.name || '').toString().toLowerCase();
            const nameB = (b.common.name || '').toString().toLowerCase();
            return nameA.localeCompare(nameB);
        });

        return result;
    }
}

module.exports = ObjectFilter;