const assert = require('assert');
const sinon = require('sinon');
const ConfigValidator = require('../../lib/config-validator');

describe('ConfigValidator', function() {
    let logger;

    beforeEach(function() {
        logger = {
            info: sinon.stub(),
            debug: sinon.stub(),
            warn: sinon.stub(),
            error: sinon.stub()
        };
    });

    afterEach(function() {
        sinon.restore();
    });

    describe('validateAndNormalize()', function() {
        
        it('should validate a complete valid configuration', function() {
            // Arrange
            const config = {
                powerSourceObject: 'shelly.0.TotalActivePower',
                inverters: [
                    { inverterObject: 'opendtu.0.123456789', maxPower: 2000 },
                    { inverterObject: 'opendtu.0.987654321', maxPower: 1800 }
                ],
                pollingInterval: 5000,
                feedInThreshold: 150,
                targetFeedIn: 600
            };

            // Act
            const result = ConfigValidator.validateAndNormalize(config, logger);

            // Assert
            assert.strictEqual(result.isValid, true);
            assert.strictEqual(result.errors.length, 0);
            assert.strictEqual(config.inverters[0].maxPower, 2000);
            assert.strictEqual(config.inverters[1].maxPower, 1800);
        });

        it('should reject configuration with missing power source object', function() {
            // Arrange
            const config = {
                inverters: [{ inverterObject: 'opendtu.0.123456789' }],
                pollingInterval: 5000,
                feedInThreshold: 150,
                targetFeedIn: 600
            };

            // Act
            const result = ConfigValidator.validateAndNormalize(config, logger);

            // Assert
            assert.strictEqual(result.isValid, false);
            assert(result.errors.includes('No power source object configured!'));
        });

        it('should reject configuration with missing inverters', function() {
            // Arrange
            const config = {
                powerSourceObject: 'shelly.0.TotalActivePower',
                pollingInterval: 5000,
                feedInThreshold: 150,
                targetFeedIn: 600
            };

            // Act
            const result = ConfigValidator.validateAndNormalize(config, logger);

            // Assert
            assert.strictEqual(result.isValid, false);
            assert(result.errors.includes('No inverters configured!'));
        });

        it('should reject configuration with empty inverters array', function() {
            // Arrange
            const config = {
                powerSourceObject: 'shelly.0.TotalActivePower',
                inverters: [],
                pollingInterval: 5000,
                feedInThreshold: 150,
                targetFeedIn: 600
            };

            // Act
            const result = ConfigValidator.validateAndNormalize(config, logger);

            // Assert
            assert.strictEqual(result.isValid, false);
            assert(result.errors.includes('No inverters configured!'));
        });

        it('should reject inverter without inverterObject', function() {
            // Arrange
            const config = {
                powerSourceObject: 'shelly.0.TotalActivePower',
                inverters: [{ maxPower: 2000 }],
                pollingInterval: 5000,
                feedInThreshold: 150,
                targetFeedIn: 600
            };

            // Act
            const result = ConfigValidator.validateAndNormalize(config, logger);

            // Assert
            assert.strictEqual(result.isValid, false);
            assert(result.errors.includes('Inverter 1 has no inverter base object configured!'));
        });

        it('should set default maxPower when undefined', function() {
            // Arrange
            const config = {
                powerSourceObject: 'shelly.0.TotalActivePower',
                inverters: [{ inverterObject: 'opendtu.0.123456789' }],
                pollingInterval: 5000,
                feedInThreshold: 150,
                targetFeedIn: 600
            };

            // Act
            const result = ConfigValidator.validateAndNormalize(config, logger);

            // Assert
            assert.strictEqual(result.isValid, true);
            assert.strictEqual(config.inverters[0].maxPower, 2250);
            assert(logger.warn.calledWith('Inverter 1 has no max power configured, using default 2250W'));
        });

        it('should clamp maxPower when exceeds 2250W', function() {
            // Arrange
            const config = {
                powerSourceObject: 'shelly.0.TotalActivePower',
                inverters: [{ inverterObject: 'opendtu.0.123456789', maxPower: 3000 }],
                pollingInterval: 5000,
                feedInThreshold: 150,
                targetFeedIn: 600
            };

            // Act
            const result = ConfigValidator.validateAndNormalize(config, logger);

            // Assert
            assert.strictEqual(result.isValid, true);
            assert.strictEqual(config.inverters[0].maxPower, 2250);
            assert(logger.warn.calledWith('Inverter 1 max power exceeded 2250W limit, clamped to 2250W'));
        });

        it('should clamp negative maxPower to default', function() {
            // Arrange
            const config = {
                powerSourceObject: 'shelly.0.TotalActivePower',
                inverters: [{ inverterObject: 'opendtu.0.123456789', maxPower: -500 }],
                pollingInterval: 5000,
                feedInThreshold: 150,
                targetFeedIn: 600
            };

            // Act
            const result = ConfigValidator.validateAndNormalize(config, logger);

            // Assert
            assert.strictEqual(result.isValid, true);
            assert.strictEqual(config.inverters[0].maxPower, 2250);
            assert(logger.warn.calledWith('Inverter 1 has invalid max power, using default 2250W'));
        });

        it('should set default pollingInterval when invalid', function() {
            // Arrange
            const config = {
                powerSourceObject: 'shelly.0.TotalActivePower',
                inverters: [{ inverterObject: 'opendtu.0.123456789', maxPower: 2000 }],
                pollingInterval: 500,
                feedInThreshold: 150,
                targetFeedIn: 600
            };

            // Act
            const result = ConfigValidator.validateAndNormalize(config, logger);

            // Assert
            assert.strictEqual(result.isValid, true);
            assert.strictEqual(config.pollingInterval, 10000);
            assert(logger.warn.calledWith('Invalid polling interval, using default of 10000ms'));
        });

        it('should set default feedInThreshold when too low', function() {
            // Arrange
            const config = {
                powerSourceObject: 'shelly.0.TotalActivePower',
                inverters: [{ inverterObject: 'opendtu.0.123456789', maxPower: 2000 }],
                pollingInterval: 5000,
                feedInThreshold: 20,
                targetFeedIn: 600
            };

            // Act
            const result = ConfigValidator.validateAndNormalize(config, logger);

            // Assert
            assert.strictEqual(result.isValid, true);
            assert.strictEqual(config.feedInThreshold, 100);
            assert(logger.warn.calledWith('Invalid inverter limit change threshold, using default of 100W'));
        });

        it('should set default targetFeedIn when negative', function() {
            // Arrange
            const config = {
                powerSourceObject: 'shelly.0.TotalActivePower',
                inverters: [{ inverterObject: 'opendtu.0.123456789', maxPower: 2000 }],
                pollingInterval: 5000,
                feedInThreshold: 150,
                targetFeedIn: -200
            };

            // Act
            const result = ConfigValidator.validateAndNormalize(config, logger);

            // Assert
            assert.strictEqual(result.isValid, true);
            assert.strictEqual(config.targetFeedIn, 800);
            assert(logger.warn.calledWith('Invalid maximum grid export, using default of 800W'));
        });

        it('should handle multiple validation errors', function() {
            // Arrange
            const config = {
                inverters: [{ maxPower: 2000 }],
                pollingInterval: 500,
                feedInThreshold: 20,
                targetFeedIn: -200
            };

            // Act
            const result = ConfigValidator.validateAndNormalize(config, logger);

            // Assert
            assert.strictEqual(result.isValid, false);
            assert(result.errors.includes('No power source object configured!'));
            assert(result.errors.includes('Inverter 1 has no inverter base object configured!'));
            assert.strictEqual(config.pollingInterval, 10000);
            assert.strictEqual(config.feedInThreshold, 100);
            assert.strictEqual(config.targetFeedIn, 800);
        });
    });
});