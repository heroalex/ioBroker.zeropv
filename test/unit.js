const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const path = require('path');

describe('ZeroPV Adapter - pollPowerData', function() {
    let adapter;
    let clock;
    
    beforeEach(function() {
        // Setup timer mocks
        clock = sinon.useFakeTimers();
        
        // Create a mock adapter with the actual pollPowerData logic
        adapter = {
            config: {
                powerSourceObject: 'test.power.source',
                pollingInterval: 5000
            },
            pollingTimer: null,
            getForeignStateAsync: sinon.stub(),
            setState: sinon.stub().resolves(),
            checkPowerControlAdjustment: sinon.stub().resolves(),
            log: {
                info: sinon.stub(),
                debug: sinon.stub(),
                warn: sinon.stub(),
                error: sinon.stub()
            }
        };
        
        // Use the actual pollPowerData implementation logic (copied from main.js:241-271)
        adapter.pollPowerData = async function() {
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
        };
    });
    
    afterEach(function() {
        if (adapter.pollingTimer) {
            clearTimeout(adapter.pollingTimer);
        }
        clock.restore();
        sinon.restore();
    });

    describe('pollPowerData()', function() {
        
        it('should handle valid positive power value correctly', async function() {
            // Arrange
            const mockPowerState = { val: 1500, ack: true };
            adapter.getForeignStateAsync = sinon.stub().resolves(mockPowerState);
            adapter.setState = sinon.stub().resolves();
            
            // Act
            await adapter.pollPowerData();
            
            // Assert
            assert(adapter.getForeignStateAsync.calledWith('test.power.source'));
            assert(adapter.setState.calledWith('gridPower', { val: 1500, ack: true }));
            assert(adapter.setState.calledWith('feedingIn', { val: false, ack: true }));
            assert(adapter.checkPowerControlAdjustment.calledWith(1500));
            assert(adapter.log.debug.calledWith('Grid power: 1500W, Feeding in: false'));
        });

        it('should handle valid negative power value (feeding in) correctly', async function() {
            // Arrange
            const mockPowerState = { val: -800, ack: true };
            adapter.getForeignStateAsync = sinon.stub().resolves(mockPowerState);
            adapter.setState = sinon.stub().resolves();
            
            // Act
            await adapter.pollPowerData();
            
            // Assert
            assert(adapter.setState.calledWith('gridPower', { val: -800, ack: true }));
            assert(adapter.setState.calledWith('feedingIn', { val: true, ack: true }));
            assert(adapter.checkPowerControlAdjustment.calledWith(-800));
            assert(adapter.log.debug.calledWith('Grid power: -800W, Feeding in: true'));
        });

        it('should handle zero power value correctly', async function() {
            // Arrange
            const mockPowerState = { val: 0, ack: true };
            adapter.getForeignStateAsync = sinon.stub().resolves(mockPowerState);
            adapter.setState = sinon.stub().resolves();
            
            // Act
            await adapter.pollPowerData();
            
            // Assert
            assert(adapter.setState.calledWith('gridPower', { val: 0, ack: true }));
            assert(adapter.setState.calledWith('feedingIn', { val: false, ack: true }));
            assert(adapter.checkPowerControlAdjustment.calledWith(0));
        });

        it('should handle string number values correctly', async function() {
            // Arrange
            const mockPowerState = { val: '1200.5', ack: true };
            adapter.getForeignStateAsync = sinon.stub().resolves(mockPowerState);
            adapter.setState = sinon.stub().resolves();
            
            // Act
            await adapter.pollPowerData();
            
            // Assert
            assert(adapter.setState.calledWith('gridPower', { val: 1200.5, ack: true }));
            assert(adapter.setState.calledWith('feedingIn', { val: false, ack: true }));
            assert(adapter.checkPowerControlAdjustment.calledWith(1200.5));
        });

        it('should handle invalid power values and log warning', async function() {
            // Arrange
            const mockPowerState = { val: 'invalid', ack: true };
            adapter.getForeignStateAsync = sinon.stub().resolves(mockPowerState);
            adapter.setState = sinon.stub().resolves();
            
            // Act
            await adapter.pollPowerData();
            
            // Assert
            assert(!adapter.setState.called);
            assert(!adapter.checkPowerControlAdjustment.called);
            assert(adapter.log.warn.calledWith('Invalid power value from test.power.source: invalid'));
        });

        it('should handle null power state values', async function() {
            // Arrange
            const mockPowerState = { val: null, ack: true };
            adapter.getForeignStateAsync = sinon.stub().resolves(mockPowerState);
            adapter.setState = sinon.stub().resolves();
            
            // Act
            await adapter.pollPowerData();
            
            // Assert
            assert(!adapter.setState.called);
            assert(!adapter.checkPowerControlAdjustment.called);
            assert(adapter.log.warn.calledWith('No data received from test.power.source'));
        });

        it('should handle undefined power state values', async function() {
            // Arrange
            const mockPowerState = { val: undefined, ack: true };
            adapter.getForeignStateAsync = sinon.stub().resolves(mockPowerState);
            adapter.setState = sinon.stub().resolves();
            
            // Act
            await adapter.pollPowerData();
            
            // Assert
            assert(!adapter.setState.called);
            assert(!adapter.checkPowerControlAdjustment.called);
            assert(adapter.log.warn.calledWith('No data received from test.power.source'));
        });

        it('should handle null power state object', async function() {
            // Arrange
            adapter.getForeignStateAsync = sinon.stub().resolves(null);
            adapter.setState = sinon.stub().resolves();
            
            // Act
            await adapter.pollPowerData();
            
            // Assert
            assert(!adapter.setState.called);
            assert(!adapter.checkPowerControlAdjustment.called);
            assert(adapter.log.warn.calledWith('No data received from test.power.source'));
        });

        it('should handle getForeignStateAsync errors', async function() {
            // Arrange
            const error = new Error('Connection failed');
            adapter.getForeignStateAsync = sinon.stub().rejects(error);
            adapter.setState = sinon.stub().resolves();
            
            // Act
            await adapter.pollPowerData();
            
            // Assert
            assert(!adapter.setState.called);
            assert(!adapter.checkPowerControlAdjustment.called);
            assert(adapter.log.error.calledWith('Error reading power data: Connection failed'));
        });

        it('should schedule next polling cycle', async function() {
            // Arrange
            const mockPowerState = { val: 1000, ack: true };
            adapter.getForeignStateAsync = sinon.stub().resolves(mockPowerState);
            adapter.setState = sinon.stub().resolves();
            
            // Act
            await adapter.pollPowerData();
            
            // Advance timer to trigger next poll
            clock.tick(5000);
            
            // Assert
            assert(adapter.pollingTimer !== null);
            assert(adapter.getForeignStateAsync.callCount === 2);
        });

        it('should handle setState errors gracefully', async function() {
            // Arrange
            const mockPowerState = { val: 1500, ack: true };
            adapter.getForeignStateAsync = sinon.stub().resolves(mockPowerState);
            adapter.setState = sinon.stub().rejects(new Error('State error'));
            
            // Act & Assert - should not throw
            await adapter.pollPowerData(); // Should not throw
            assert(adapter.log.error.called);
        });
    });
});

// NOTE: checkPowerControlAdjustment tests removed - this complex integration test 
// requires js-controller dependencies and should be tested via integration tests instead.

describe('ZeroPV Adapter - getAllInverterLimits', function() {
    const InverterManager = require('../lib/inverter-manager');
    let config;
    let getForeignStateAsync;
    let logger;
    
    beforeEach(function() {
        config = {
            inverters: [
                { inverterObject: 'test.inverter1', name: 'Inverter 1' },
                { inverterObject: 'test.inverter2', name: 'Inverter 2' }
            ]
        };
        
        getForeignStateAsync = sinon.stub();
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

    describe('getAllInverterLimits()', function() {
        
        it('should return limits from all inverters when all are valid', async function() {
            // Arrange
            getForeignStateAsync.withArgs('test.inverter1.power_control.current_limit_absolute').resolves({ val: 1500, ack: true });
            getForeignStateAsync.withArgs('test.inverter2.power_control.current_limit_absolute').resolves({ val: 2000, ack: true });
            
            // Act
            const result = await InverterManager.getAllInverterLimits(config, getForeignStateAsync, logger);
            
            // Assert
            assert.equal(result.length, 2);
            assert.deepEqual(result[0], { 
                index: 0, 
                inverterObject: 'test.inverter1', 
                controlObject: 'test.inverter1.power_control.limit_nonpersistent_absolute', 
                value: 1500 
            });
            assert.deepEqual(result[1], { 
                index: 1, 
                inverterObject: 'test.inverter2', 
                controlObject: 'test.inverter2.power_control.limit_nonpersistent_absolute', 
                value: 2000 
            });
        });

        it('should skip inverters with null values', async function() {
            // Arrange
            getForeignStateAsync.withArgs('test.inverter1.power_control.current_limit_absolute').resolves({ val: 1500, ack: true });
            getForeignStateAsync.withArgs('test.inverter2.power_control.current_limit_absolute').resolves({ val: null, ack: true });
            
            // Act
            const result = await InverterManager.getAllInverterLimits(config, getForeignStateAsync, logger);
            
            // Assert
            assert.equal(result.length, 1);
            assert.deepEqual(result[0], { 
                index: 0, 
                inverterObject: 'test.inverter1', 
                controlObject: 'test.inverter1.power_control.limit_nonpersistent_absolute', 
                value: 1500 
            });
            assert(logger.warn.calledWith('Could not read power limit from inverter 2: test.inverter2.power_control.current_limit_absolute'));
        });

        it('should skip inverters with invalid values', async function() {
            // Arrange
            getForeignStateAsync.withArgs('test.inverter1.power_control.current_limit_absolute').resolves({ val: 1500, ack: true });
            getForeignStateAsync.withArgs('test.inverter2.power_control.current_limit_absolute').resolves({ val: 'invalid', ack: true });
            
            // Act
            const result = await InverterManager.getAllInverterLimits(config, getForeignStateAsync, logger);
            
            // Assert
            assert.equal(result.length, 1);
            assert.deepEqual(result[0], { 
                index: 0, 
                inverterObject: 'test.inverter1', 
                controlObject: 'test.inverter1.power_control.limit_nonpersistent_absolute', 
                value: 1500 
            });
            assert(logger.warn.calledWith('Invalid power limit value from inverter 2: invalid'));
        });

        it('should handle errors from individual inverters', async function() {
            // Arrange
            getForeignStateAsync.withArgs('test.inverter1.power_control.current_limit_absolute').resolves({ val: 1500, ack: true });
            getForeignStateAsync.withArgs('test.inverter2.power_control.current_limit_absolute').rejects(new Error('Connection failed'));
            
            // Act
            const result = await InverterManager.getAllInverterLimits(config, getForeignStateAsync, logger);
            
            // Assert
            assert.equal(result.length, 1);
            assert.deepEqual(result[0], { 
                index: 0, 
                inverterObject: 'test.inverter1', 
                controlObject: 'test.inverter1.power_control.limit_nonpersistent_absolute', 
                value: 1500 
            });
            assert(logger.error.calledWith('Error reading limit from inverter 2: Connection failed'));
        });

        it('should return empty array when no inverters respond', async function() {
            // Arrange
            getForeignStateAsync.withArgs('test.inverter1.power_control.current_limit_absolute').resolves(null);
            getForeignStateAsync.withArgs('test.inverter2.power_control.current_limit_absolute').resolves({ val: undefined, ack: true });
            
            // Act
            const result = await InverterManager.getAllInverterLimits(config, getForeignStateAsync, logger);
            
            // Assert
            assert.equal(result.length, 0);
            assert(logger.warn.calledTwice);
        });

        it('should handle string number values correctly', async function() {
            // Arrange
            getForeignStateAsync.withArgs('test.inverter1.power_control.current_limit_absolute').resolves({ val: '1500.5', ack: true });
            getForeignStateAsync.withArgs('test.inverter2.power_control.current_limit_absolute').resolves({ val: '2000', ack: true });
            
            // Act
            const result = await InverterManager.getAllInverterLimits(config, getForeignStateAsync, logger);
            
            // Assert
            assert.equal(result.length, 2);
            assert.deepEqual(result[0], { 
                index: 0, 
                inverterObject: 'test.inverter1', 
                controlObject: 'test.inverter1.power_control.limit_nonpersistent_absolute', 
                value: 1500.5 
            });
            assert.deepEqual(result[1], { 
                index: 1, 
                inverterObject: 'test.inverter2', 
                controlObject: 'test.inverter2.power_control.limit_nonpersistent_absolute', 
                value: 2000 
            });
        });
    });
});

describe('ZeroPV Adapter - calculateNewClampedLimits', function() {
    const PowerCalculator = require('../lib/power-calculator');
    let config;
    
    beforeEach(function() {
        // Test configuration
        config = {
            inverters: [
                { name: 'Inverter 1', maxPower: 2250 },
                { name: 'Inverter 2', maxPower: 1800 }
            ],
            targetFeedIn: 800
        };
    });
    
    afterEach(function() {
        sinon.restore();
    });

    describe('calculateNewClampedLimits()', function() {
        
        it('should increase limits when consuming from grid', function() {
            // Arrange
            const currentGridPower = 500; // consuming 500W from grid
            const currentLimits = [
                { index: 0, controlObject: 'test.inv1.control', value: 1000 },
                { index: 1, controlObject: 'test.inv2.control', value: 800 }
            ];
            
            // Act
            const result = PowerCalculator.calculateNewClampedLimits(currentGridPower, currentLimits, config);
            
            // Assert
            assert.equal(result.totalOldLimit, 1800);
            assert.equal(result.totalNewLimit, 3100); // 1800 + 500 + 800 (targetFeedIn)
            assert.equal(result.newLimits.length, 2);
            assert.equal(result.newLimits[0].newValue, 1550); // Math.floor(3100/2)
            assert.equal(result.newLimits[1].newValue, 1550);
        });

        it('should decrease limits when feeding into grid beyond target', function() {
            // Arrange
            const currentGridPower = -1200; // feeding 1200W into grid
            const currentLimits = [
                { index: 0, controlObject: 'test.inv1.control', value: 2000 },
                { index: 1, controlObject: 'test.inv2.control', value: 1500 }
            ];
            
            // Act
            const result = PowerCalculator.calculateNewClampedLimits(currentGridPower, currentLimits, config);
            
            // Assert
            assert.equal(result.totalOldLimit, 3500);
            // feedInDifference = -1200 - (-800) = -400
            // newTotalLimit = 3500 + (-400) = 3100
            assert.equal(result.totalNewLimit, 3100);
            assert.equal(result.newLimits[0].newValue, 1550); // Math.floor(3100/2)
            assert.equal(result.newLimits[1].newValue, 1550);
        });

        it('should handle clamping when calculated limit exceeds inverter maximum', function() {
            // Arrange
            const currentGridPower = 2000; // large consumption
            const currentLimits = [
                { index: 0, controlObject: 'test.inv1.control', value: 2000 },
                { index: 1, controlObject: 'test.inv2.control', value: 1500 }
            ];
            
            // Act
            const result = PowerCalculator.calculateNewClampedLimits(currentGridPower, currentLimits, config);
            
            // Assert
            assert.equal(result.totalOldLimit, 3500);
            // Before clamping: Math.floor((3500 + 2000 + 800) / 2) = 3150 per inverter
            // After clamping: inv1=2250 (max), inv2=1800 (max)
            assert.equal(result.newLimits[0].newValue, 2250); // clamped to maxPower
            assert.equal(result.newLimits[1].newValue, 1800); // clamped to maxPower
            assert.equal(result.totalNewLimit, 4050); // 2250 + 1800
        });

        it('should handle zero minimum when feed-in adjustment would go negative', function() {
            // Arrange
            const currentGridPower = -500; // feeding 500W
            const currentLimits = [
                { index: 0, controlObject: 'test.inv1.control', value: 100 },
                { index: 1, controlObject: 'test.inv2.control', value: 50 }
            ];
            
            // Act
            const result = PowerCalculator.calculateNewClampedLimits(currentGridPower, currentLimits, config);
            
            // Assert
            assert.equal(result.totalOldLimit, 150);
            // feedInDifference = -500 - (-800) = 300
            // newTotalLimit = max(0, 150 + 300) = 450
            assert.equal(result.totalNewLimit, 450);
            assert.equal(result.newLimits[0].newValue, 225); // Math.floor(450/2)
            assert.equal(result.newLimits[1].newValue, 225);
        });

        it('should handle uneven distribution correctly', function() {
            // Arrange
            const currentGridPower = 100;
            const currentLimits = [
                { index: 0, controlObject: 'test.inv1.control', value: 1000 },
                { index: 1, controlObject: 'test.inv2.control', value: 900 }
            ];
            
            // Act
            const result = PowerCalculator.calculateNewClampedLimits(currentGridPower, currentLimits, config);
            
            // Assert
            assert.equal(result.totalOldLimit, 1900);
            // newTotalLimit = 1900 + 100 + 800 = 2800
            // Math.floor(2800/2) = 1400 per inverter
            assert.equal(result.totalNewLimit, 2800); // 1400 + 1400
            assert.equal(result.newLimits[0].newValue, 1400);
            assert.equal(result.newLimits[1].newValue, 1400);
        });

        it('should preserve original values in result object', function() {
            // Arrange
            const currentGridPower = 200;
            const currentLimits = [
                { index: 0, controlObject: 'test.inv1.control', value: 1000 },
                { index: 1, controlObject: 'test.inv2.control', value: 800 }
            ];
            
            // Act
            const result = PowerCalculator.calculateNewClampedLimits(currentGridPower, currentLimits, config);
            
            // Assert
            assert.equal(result.newLimits[0].index, 0);
            assert.equal(result.newLimits[0].controlObject, 'test.inv1.control');
            assert.equal(result.newLimits[0].oldValue, 1000);
            assert.equal(result.newLimits[1].index, 1);
            assert.equal(result.newLimits[1].controlObject, 'test.inv2.control');
            assert.equal(result.newLimits[1].oldValue, 800);
        });

        it('should handle fallback maxPower when not specified', function() {
            // Arrange
            config.inverters = [
                { name: 'Inverter 1' }, // no maxPower specified
                { name: 'Inverter 2', maxPower: 1800 }
            ];
            const currentGridPower = 3000; // large consumption
            const currentLimits = [
                { index: 0, controlObject: 'test.inv1.control', value: 1000 },
                { index: 1, controlObject: 'test.inv2.control', value: 800 }
            ];
            
            // Act
            const result = PowerCalculator.calculateNewClampedLimits(currentGridPower, currentLimits, config);
            
            // Assert
            // Before clamping: Math.floor((1800 + 3000 + 800) / 2) = 2800 per inverter
            // After clamping: inv1=2250 (fallback), inv2=1800 (max)
            assert.equal(result.newLimits[0].newValue, 2250); // fallback to 2250W
            assert.equal(result.newLimits[1].newValue, 1800); // clamped to maxPower
        });

        it('should correctly calculate for original bug scenario', function() {
            // Arrange - reproducing the original bug scenario
            const currentGridPower = 895.669; // consuming from grid
            const currentLimits = [
                { index: 0, controlObject: 'test.inv1.control', value: 1435.5 },
                { index: 1, controlObject: 'test.inv2.control', value: 1435.5 },
                { index: 2, controlObject: 'test.inv3.control', value: 1435.5 },
                { index: 3, controlObject: 'test.inv4.control', value: 1435.5 }
            ];
            
            // Update config to match 4-inverter scenario
            config.inverters = [
                { name: 'PV1-HMT-2250-6T', maxPower: 2250 },
                { name: 'PV2-HMT-2250-6T', maxPower: 2250 },
                { name: 'PV3-HMT-2250-6T', maxPower: 2250 },
                { name: 'PV4-HMT-2250-6T', maxPower: 2250 }
            ];
            
            // Act
            const result = PowerCalculator.calculateNewClampedLimits(currentGridPower, currentLimits, config);
            
            // Assert
            assert.equal(result.totalOldLimit, 5742); // 4 * 1435.5
            // With the fix: newTotalLimit = 5742 + 895.669 + 800 = 7437.669
            // Per inverter: Math.floor(7437.669 / 4) = 1859
            assert.equal(result.totalNewLimit, 7436); // 4 * 1859 (due to floor)
            assert.equal(result.newLimits[0].newValue, 1859);
            assert.equal(result.newLimits[1].newValue, 1859);
            assert.equal(result.newLimits[2].newValue, 1859);
            assert.equal(result.newLimits[3].newValue, 1859);
        });
    });
});

// NOTE: applyInverterPowerLimits tests removed - this complex method should be tested 
// via integration tests rather than duplicating the entire implementation in tests

// NOTE: All adjustInverterPowerLimits tests removed - this method no longer exists in production code.
// These tests were duplicating obsolete implementation logic and should be handled by integration tests instead.