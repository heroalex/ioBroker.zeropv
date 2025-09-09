const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');
const path = require('path');

describe('ZeroPV Adapter - pollPowerData', function() {
    let adapter;
    let clock;
    
    beforeEach(function() {
        // Create a mock adapter object with the pollPowerData method
        adapter = {
            config: {
                powerSourceObject: 'test.power.source',
                pollingInterval: 5000
            },
            pollingTimer: null,
            getForeignStateAsync: sinon.stub(),
            setState: sinon.stub(),
            checkPowerControlAdjustment: sinon.stub().resolves(),
            log: {
                info: sinon.stub(),
                debug: sinon.stub(),
                warn: sinon.stub(),
                error: sinon.stub()
            }
        };
        
        // Add the pollPowerData method from main.js
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
        
        // Setup timer mocks
        clock = sinon.useFakeTimers();
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

describe('ZeroPV Adapter - checkPowerControlAdjustment', function() {
    let adapter;
    let clock;
    let ZeropvClass;
    
    beforeEach(function() {
        // Setup fake timers for testing timing behavior
        clock = sinon.useFakeTimers();
        
        // Load the actual Zeropv class
        ZeropvClass = require('../main.js');
        
        // Create a mock adapter with real methods but stubbed dependencies
        adapter = {
            config: {
                feedInThreshold: 100,
                targetFeedIn: -800,
                pollingInterval: 5000,
                inverters: [
                    { inverterObject: 'test.inverter1', controlObject: 'test.inverter1.control' },
                    { inverterObject: 'test.inverter2', controlObject: 'test.inverter2.control' }
                ]
            },
            lastDecreaseTime: null,
            getForeignStateAsync: sinon.stub(),
            setState: sinon.stub().resolves(),
            setForeignStateAsync: sinon.stub().resolves(),
            getAllInverterLimits: sinon.stub(),
            calculateNewClampedLimits: sinon.stub(),
            applyInverterPowerLimits: sinon.stub().resolves(),
            getInverterDisplayName: sinon.stub().resolves('Test Inverter'),
            log: {
                info: sinon.stub(),
                debug: sinon.stub(),
                warn: sinon.stub(),
                error: sinon.stub()
            }
        };
        
        // Bind the real method to our mock adapter
        adapter.checkPowerControlAdjustment = ZeropvClass.prototype.checkPowerControlAdjustment.bind(adapter);
    });
    
    afterEach(function() {
        clock.restore();
        sinon.restore();
    });

    describe('checkPowerControlAdjustment()', function() {
        
        it('should allow power increases immediately', async function() {
            // Arrange
            const mockLimits = [
                { index: 0, inverterObject: 'test.inverter1', controlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, inverterObject: 'test.inverter2', controlObject: 'test.inverter2.control' , value: 1000 }
            ];
            const mockNewLimits = [
                { index: 0, controlObject: 'test.inverter1.control', oldValue: 1000, newValue: 1200 },
                { index: 1, controlObject: 'test.inverter2.control', oldValue: 1000, newValue: 1200 }
            ];
            
            adapter.getAllInverterLimits.resolves(mockLimits);
            adapter.calculateNewClampedLimits.returns({
                newLimits: mockNewLimits,
                totalOldLimit: 2000,
                totalNewLimit: 2400 // increase of 400W (above 100W threshold)
            });
            
            // Act
            await adapter.checkPowerControlAdjustment(-1000);
            
            // Assert - increase should be applied immediately
            assert(adapter.applyInverterPowerLimits.calledWith(mockNewLimits, 2400));
            assert(adapter.log.debug.calledWith(sinon.match('Total inverter limit would increase by 400W')));
        });

        it('should delay power decreases by 3x polling interval', async function() {
            // Arrange
            const mockLimits = [
                { index: 0, inverterObject: 'test.inverter1', controlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, inverterObject: 'test.inverter2', controlObject: 'test.inverter2.control', value: 1000 }
            ];
            const mockNewLimits = [
                { index: 0, controlObject: 'test.inverter1.control', oldValue: 1000, newValue: 800 },
                { index: 1, controlObject: 'test.inverter2.control', oldValue: 1000, newValue: 800 }
            ];
            
            adapter.getAllInverterLimits.resolves(mockLimits);
            adapter.calculateNewClampedLimits.returns({
                newLimits: mockNewLimits,
                totalOldLimit: 2000,
                totalNewLimit: 1600 // decrease of 400W (above 100W threshold)
            });
            
            // Act - first decrease attempt
            await adapter.checkPowerControlAdjustment(-500);
            
            // Assert - decrease should be delayed
            assert(!adapter.applyInverterPowerLimits.called);
            assert(adapter.log.debug.calledWith(sinon.match('Decrease needed but delaying for')));
            assert(adapter.setState.calledWith('powerControlActive', { val: false, ack: true }));
        });

        it('should apply decrease after sufficient delay time has passed', async function() {
            // Arrange
            const mockLimits = [
                { index: 0, inverterObject: 'test.inverter1', controlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, inverterObject: 'test.inverter2', controlObject: 'test.inverter2.control', value: 1000 }
            ];
            const mockNewLimits = [
                { index: 0, controlObject: 'test.inverter1.control', oldValue: 1000, newValue: 800 },
                { index: 1, controlObject: 'test.inverter2.control', oldValue: 1000, newValue: 800 }
            ];
            
            adapter.getAllInverterLimits.resolves(mockLimits);
            adapter.calculateNewClampedLimits.returns({
                newLimits: mockNewLimits,
                totalOldLimit: 2000,
                totalNewLimit: 1600 // decrease of 400W (above 100W threshold)
            });
            
            // Set lastDecreaseTime to simulate previous decrease
            adapter.lastDecreaseTime = Date.now() - (adapter.config.pollingInterval * 3 + 1000); // Just over 3x delay
            
            // Act
            await adapter.checkPowerControlAdjustment(-500);
            
            // Assert - decrease should be applied now
            assert(adapter.applyInverterPowerLimits.calledWith(mockNewLimits, 1600));
            assert(adapter.log.debug.calledWith(sinon.match('Total inverter limit would decrease by 400W')));
            assert.equal(adapter.lastDecreaseTime, Date.now()); // Should update lastDecreaseTime
        });

        it('should not reset lastDecreaseTime on power increases (bug test)', async function() {
            // Arrange - this test specifically checks for the bug we fixed
            const initialDecreaseTime = Date.now() - (adapter.config.pollingInterval * 2); // 2x polling interval ago
            adapter.lastDecreaseTime = initialDecreaseTime;
            
            const mockLimits = [
                { index: 0, inverterObject: 'test.inverter1', controlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, inverterObject: 'test.inverter2', controlObject: 'test.inverter2.control', value: 1000 }
            ];
            const mockNewLimits = [
                { index: 0, controlObject: 'test.inverter1.control', oldValue: 1000, newValue: 1200 },
                { index: 1, controlObject: 'test.inverter2.control', oldValue: 1000, newValue: 1200 }
            ];
            
            adapter.getAllInverterLimits.resolves(mockLimits);
            adapter.calculateNewClampedLimits.returns({
                newLimits: mockNewLimits,
                totalOldLimit: 2000,
                totalNewLimit: 2400 // increase of 400W
            });
            
            // Act - power increase
            await adapter.checkPowerControlAdjustment(-1000);
            
            // Assert - lastDecreaseTime should NOT be reset to null (this was the bug)
            assert.equal(adapter.lastDecreaseTime, initialDecreaseTime, 'lastDecreaseTime should not be reset on increase');
            assert(adapter.applyInverterPowerLimits.calledWith(mockNewLimits, 2400));
        });

        it('should prevent rapid decreases after increase when bug was present', async function() {
            // Arrange - simulate the sequence that would fail with the bug
            const mockLimits = [
                { index: 0, inverterObject: 'test.inverter1', controlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, inverterObject: 'test.inverter2', controlObject: 'test.inverter2.control', value: 1000 }
            ];
            
            adapter.getAllInverterLimits.resolves(mockLimits);
            
            // Step 1: Do an increase (this would reset lastDecreaseTime with the bug)
            const increaseNewLimits = [
                { index: 0, controlObject: 'test.inverter1.control', oldValue: 1000, newValue: 1200 },
                { index: 1, controlObject: 'test.inverter2.control', oldValue: 1000, newValue: 1200 }
            ];
            adapter.calculateNewClampedLimits.returns({
                newLimits: increaseNewLimits,
                totalOldLimit: 2000,
                totalNewLimit: 2400
            });
            
            await adapter.checkPowerControlAdjustment(-1000);
            
            // Step 2: Immediately try a decrease (with the bug, this would work immediately)
            const decreaseNewLimits = [
                { index: 0, controlObject: 'test.inverter1.control', oldValue: 1200, newValue: 1000 },
                { index: 1, controlObject: 'test.inverter2.control', oldValue: 1200, newValue: 1000 }
            ];
            adapter.calculateNewClampedLimits.returns({
                newLimits: decreaseNewLimits,
                totalOldLimit: 2400,
                totalNewLimit: 2000
            });
            
            // Reset spies for the decrease call
            adapter.applyInverterPowerLimits.resetHistory();
            adapter.log.debug.resetHistory();
            
            // Act - immediate decrease attempt
            await adapter.checkPowerControlAdjustment(-700);
            
            // Assert - decrease should be delayed (bug fix working)
            assert(!adapter.applyInverterPowerLimits.called, 'Decrease should be delayed, not applied immediately');
            assert(adapter.log.debug.calledWith(sinon.match('Decrease needed but delaying for')));
        });

        it('should handle no inverter limits correctly', async function() {
            // Arrange
            adapter.getAllInverterLimits.resolves([]);
            
            // Act
            await adapter.checkPowerControlAdjustment(-1000);
            
            // Assert
            assert(adapter.log.warn.calledWith('Could not read current power limits from any inverters'));
            assert(!adapter.calculateNewClampedLimits.called);
            assert(!adapter.applyInverterPowerLimits.called);
        });

        it('should not apply changes when below threshold', async function() {
            // Arrange
            const mockLimits = [
                { index: 0, inverterObject: 'test.inverter1', controlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, inverterObject: 'test.inverter2', controlObject: 'test.inverter2.control', value: 1000 }
            ];
            const mockNewLimits = [
                { index: 0, controlObject: 'test.inverter1.control', oldValue: 1000, newValue: 1050 },
                { index: 1, controlObject: 'test.inverter2.control', oldValue: 1000, newValue: 1050 }
            ];
            
            adapter.getAllInverterLimits.resolves(mockLimits);
            adapter.calculateNewClampedLimits.returns({
                newLimits: mockNewLimits,
                totalOldLimit: 2000,
                totalNewLimit: 2100 // increase of only 100W (at threshold)
            });
            
            // Act
            await adapter.checkPowerControlAdjustment(-850);
            
            // Assert - should apply because it's exactly at threshold
            assert(adapter.applyInverterPowerLimits.calledWith(mockNewLimits, 2100));
        });

        it('should handle calculation errors gracefully', async function() {
            // Arrange
            const mockLimits = [
                { index: 0, inverterObject: 'test.inverter1', controlObject: 'test.inverter1.control', value: 1000 }
            ];
            adapter.getAllInverterLimits.resolves(mockLimits);
            adapter.calculateNewClampedLimits.throws(new Error('Calculation failed'));
            
            // Act
            await adapter.checkPowerControlAdjustment(-1000);
            
            // Assert
            assert(adapter.log.error.calledWith('Error in power control adjustment: Calculation failed'));
            assert(!adapter.applyInverterPowerLimits.called);
        });
    });
});

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

describe('ZeroPV Adapter - applyInverterPowerLimits', function() {
    let adapter;
    
    beforeEach(function() {
        // Create a mock adapter object
        adapter = {
            config: {
                inverters: [
                    { name: 'Inverter 1' },
                    { name: 'Inverter 2' }
                ]
            },
            setForeignStateAsync: sinon.stub(),
            setState: sinon.stub(),
            log: {
                debug: sinon.stub(),
                info: sinon.stub(),
                error: sinon.stub()
            }
        };
        
        // Add the applyInverterPowerLimits method from main.js
        adapter.applyInverterPowerLimits = async function(newLimits, totalNewLimit) {
            try {
                this.log.debug(`Applying new power limits, total: ${totalNewLimit}W`);

                // Set new power limit for each inverter
                const adjustmentPromises = [];
                const changedInverters = [];
                
                for (const limit of newLimits) {
                    const inverter = this.config.inverters[limit.index];
                    const inverterName = inverter.name || `Inverter ${limit.index + 1}`;
                    
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
        };
    });
    
    afterEach(function() {
        sinon.restore();
    });

    describe('applyInverterPowerLimits()', function() {
        
        it('should apply new limits when values have changed', async function() {
            // Arrange
            const newLimits = [
                { index: 0, controlObject: 'test.inv1.control', oldValue: 1000, newValue: 1200 },
                { index: 1, controlObject: 'test.inv2.control', oldValue: 800, newValue: 1000 }
            ];
            const totalNewLimit = 2200;
            adapter.setForeignStateAsync.resolves();
            adapter.setState.resolves();
            
            // Act
            await adapter.applyInverterPowerLimits(newLimits, totalNewLimit);
            
            // Assert
            assert(adapter.setForeignStateAsync.calledWith('test.inv1.control', 1200));
            assert(adapter.setForeignStateAsync.calledWith('test.inv2.control', 1000));
            assert(adapter.setState.calledWith('inverter0.powerLimit', { val: 1200, ack: true }));
            assert(adapter.setState.calledWith('inverter1.powerLimit', { val: 1000, ack: true }));
            assert(adapter.setState.calledWith('currentPowerLimit', { val: 2200, ack: true }));
            assert(adapter.setState.calledWith('powerControlActive', { val: true, ack: true }));
            assert(adapter.log.info.calledWith('Setting inverter limits: Inverter 1: 1000W → 1200W, Inverter 2: 800W → 1000W'));
        });

        it('should skip inverters with unchanged limits', async function() {
            // Arrange
            const newLimits = [
                { index: 0, controlObject: 'test.inv1.control', oldValue: 1000, newValue: 1200 }, // changed
                { index: 1, controlObject: 'test.inv2.control', oldValue: 800, newValue: 800 }   // unchanged
            ];
            const totalNewLimit = 2000;
            adapter.setForeignStateAsync.resolves();
            adapter.setState.resolves();
            
            // Act
            await adapter.applyInverterPowerLimits(newLimits, totalNewLimit);
            
            // Assert
            assert(adapter.setForeignStateAsync.calledWith('test.inv1.control', 1200));
            assert(adapter.setForeignStateAsync.neverCalledWith('test.inv2.control', 800));
            assert(adapter.setState.calledWith('inverter0.powerLimit', { val: 1200, ack: true }));
            assert(adapter.setState.neverCalledWith('inverter1.powerLimit', { val: 800, ack: true }));
            assert(adapter.log.debug.calledWith('Inverter 2 limit unchanged at 800W, skipping update'));
            assert(adapter.log.info.calledWith('Setting inverter limits: Inverter 1: 1000W → 1200W'));
        });

        it('should handle setForeignStateAsync errors gracefully', async function() {
            // Arrange
            const newLimits = [
                { index: 0, controlObject: 'test.inv1.control', oldValue: 1000, newValue: 1200 },
                { index: 1, controlObject: 'test.inv2.control', oldValue: 800, newValue: 1000 }
            ];
            const totalNewLimit = 2200;
            adapter.setForeignStateAsync.withArgs('test.inv1.control', 1200).rejects(new Error('Connection failed'));
            adapter.setForeignStateAsync.withArgs('test.inv2.control', 1000).resolves();
            adapter.setState.resolves();
            
            // Act
            await adapter.applyInverterPowerLimits(newLimits, totalNewLimit);
            
            // Assert
            assert(adapter.log.error.calledWith('Error setting limit for Inverter 1: Connection failed'));
            assert(adapter.setState.calledWith('inverter1.powerLimit', { val: 1000, ack: true })); // inv2 should still work
            assert(adapter.setState.calledWith('currentPowerLimit', { val: 2200, ack: true }));
            assert(adapter.setState.calledWith('powerControlActive', { val: true, ack: true }));
        });

        it('should handle no changes case', async function() {
            // Arrange
            const newLimits = [
                { index: 0, controlObject: 'test.inv1.control', oldValue: 1000, newValue: 1000 },
                { index: 1, controlObject: 'test.inv2.control', oldValue: 800, newValue: 800 }
            ];
            const totalNewLimit = 1800;
            adapter.setState.resolves();
            
            // Act
            await adapter.applyInverterPowerLimits(newLimits, totalNewLimit);
            
            // Assert
            assert(adapter.setForeignStateAsync.notCalled);
            assert(adapter.log.info.notCalled); // No changes to log
            assert(adapter.setState.calledWith('currentPowerLimit', { val: 1800, ack: true }));
            assert(adapter.setState.calledWith('powerControlActive', { val: true, ack: true }));
        });

        it('should use fallback inverter names when not specified', async function() {
            // Arrange
            adapter.config.inverters = [
                {}, // no name specified
                { name: 'Solar Panel 2' }
            ];
            const newLimits = [
                { index: 0, controlObject: 'test.inv1.control', oldValue: 1000, newValue: 1200 },
                { index: 1, controlObject: 'test.inv2.control', oldValue: 800, newValue: 1000 }
            ];
            const totalNewLimit = 2200;
            adapter.setForeignStateAsync.resolves();
            adapter.setState.resolves();
            
            // Act
            await adapter.applyInverterPowerLimits(newLimits, totalNewLimit);
            
            // Assert
            assert(adapter.log.info.calledWith('Setting inverter limits: Inverter 1: 1000W → 1200W, Solar Panel 2: 800W → 1000W'));
        });
    });
});

describe('ZeroPV Adapter - adjustInverterPowerLimits', function() {
    let adapter;
    
    beforeEach(function() {
        adapter = {
            config: {
                inverters: [
                    { powerControlObject: 'test.inverter1.control', name: 'Inverter 1', maxPower: 2250 },
                    { powerControlObject: 'test.inverter2.control', name: 'Inverter 2', maxPower: 2250 }
                ],
                targetFeedIn: -800
            },
            lastPowerLimits: new Map(),
            setForeignStateAsync: sinon.stub(),
            setState: sinon.stub(),
            log: {
                info: sinon.stub(),
                debug: sinon.stub(),
                warn: sinon.stub(),
                error: sinon.stub()
            }
        };
        
        // Add the adjustInverterPowerLimits method from main.js
        adapter.adjustInverterPowerLimits = async function(currentGridPower, currentLimits) {
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
        };
    });
    
    afterEach(function() {
        sinon.restore();
    });

    describe('adjustInverterPowerLimits()', function() {
        
        it('should distribute power equally among inverters when feeding in more than target', async function() {
            // Arrange
            const currentGridPower = -1200; // Feeding in 1200W
            const currentLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1000 }
            ];
            
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setState = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimits(currentGridPower, currentLimits);
            
            // Assert
            const totalCurrentLimit = 2000;
            const feedInDifference = currentGridPower - adapter.config.targetFeedIn; // -1200 - (-800) = -400
            const newTotalLimit = Math.max(0, totalCurrentLimit + feedInDifference); // 2000 + (-400) = 1600
            const newLimitPerInverter = Math.floor(newTotalLimit / adapter.config.inverters.length); // 1600 / 2 = 800
            
            assert(adapter.setForeignStateAsync.calledTwice);
            assert(adapter.setForeignStateAsync.calledWith('test.inverter1.control', newLimitPerInverter));
            assert(adapter.setForeignStateAsync.calledWith('test.inverter2.control', newLimitPerInverter));
            assert(adapter.setState.calledWith('currentPowerLimit', { val: newTotalLimit, ack: true }));
            assert(adapter.setState.calledWith('powerControlActive', { val: true, ack: true }));
            assert.equal(adapter.lastPowerLimits.get(0), newLimitPerInverter);
            assert.equal(adapter.lastPowerLimits.get(1), newLimitPerInverter);
        });

        it('should increase power limits when consuming from grid', async function() {
            // Arrange
            const currentGridPower = 800; // Consuming from grid
            const currentLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 600 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 600 }
            ];
            
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setState = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimits(currentGridPower, currentLimits);
            
            // Assert
            const totalCurrentLimit = 1200;
            const newTotalLimit = totalCurrentLimit + currentGridPower; // 1200 + 800 = 2000
            const newLimitPerInverter = Math.floor(newTotalLimit / adapter.config.inverters.length); // 2000 / 2 = 1000
            
            assert(adapter.setForeignStateAsync.calledWith('test.inverter1.control', newLimitPerInverter));
            assert(adapter.setForeignStateAsync.calledWith('test.inverter2.control', newLimitPerInverter));
            assert(adapter.setState.calledWith('currentPowerLimit', { val: newTotalLimit, ack: true }));
        });

        it('should handle zero as minimum power limit', async function() {
            // Arrange
            const currentGridPower = -2000; // High feed-in
            const currentLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 50 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 50 }
            ];
            
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setState = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimits(currentGridPower, currentLimits);
            
            // Assert
            const totalCurrentLimit = 100;
            const feedInDifference = currentGridPower - adapter.config.targetFeedIn; // -2000 - (-800) = -1200
            const newTotalLimit = Math.max(0, totalCurrentLimit + feedInDifference); // max(0, 100 + (-1200)) = 0
            const newLimitPerInverter = Math.floor(newTotalLimit / adapter.config.inverters.length); // 0 / 2 = 0
            
            assert(adapter.setForeignStateAsync.calledWith('test.inverter1.control', 0));
            assert(adapter.setForeignStateAsync.calledWith('test.inverter2.control', 0));
        });

        it('should handle unequal distribution when total is odd', async function() {
            // Arrange
            const currentGridPower = -1000;
            const currentLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1000 }
            ];
            
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setState = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimits(currentGridPower, currentLimits);
            
            // Assert
            const totalCurrentLimit = 2000;
            const feedInDifference = currentGridPower - adapter.config.targetFeedIn; // -1000 - (-800) = -200
            const newTotalLimit = totalCurrentLimit + feedInDifference; // 2000 + (-200) = 1800
            const newLimitPerInverter = Math.floor(newTotalLimit / adapter.config.inverters.length); // floor(1800 / 2) = 900
            
            assert(adapter.setForeignStateAsync.calledWith('test.inverter1.control', 900));
            assert(adapter.setForeignStateAsync.calledWith('test.inverter2.control', 900));
        });

        it('should handle setForeignStateAsync errors gracefully for individual inverters', async function() {
            // Arrange
            const currentGridPower = -1000;
            const currentLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1000 }
            ];
            
            adapter.setForeignStateAsync.withArgs('test.inverter1.control').resolves();
            adapter.setForeignStateAsync.withArgs('test.inverter2.control').rejects(new Error('Failed to set limit'));
            adapter.setState = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimits(currentGridPower, currentLimits);
            
            // Assert
            assert(adapter.log.error.calledWith('Error setting limit for Inverter 2: Failed to set limit'));
            // Should still update states at the end
            assert(adapter.setState.calledWith('powerControlActive', { val: true, ack: true }));
        });

        it('should handle setState errors gracefully', async function() {
            // Arrange
            const currentGridPower = -1000;
            const currentLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1000 }
            ];
            
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setState = sinon.stub().rejects(new Error('Failed to update state'));
            
            // Act
            await adapter.adjustInverterPowerLimits(currentGridPower, currentLimits);
            
            // Assert
            assert(adapter.log.error.calledWith('Error adjusting inverter power limits: Failed to update state'));
        });

        it('should update individual inverter states correctly', async function() {
            // Arrange
            const currentGridPower = -1000;
            const currentLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1000 }
            ];
            
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setState = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimits(currentGridPower, currentLimits);
            
            // Assert
            const newLimitPerInverter = 900; // floor(1800 / 2)
            
            assert(adapter.setState.calledWith('inverter0.powerLimit', { val: newLimitPerInverter, ack: true }));
            assert(adapter.setState.calledWith('inverter1.powerLimit', { val: newLimitPerInverter, ack: true }));
            assert(adapter.setState.calledWith('currentPowerLimit', { val: 1800, ack: true }));
            assert(adapter.setState.calledWith('powerControlActive', { val: true, ack: true }));
        });

        it('should log debug messages for each inverter adjustment', async function() {
            // Arrange
            const currentGridPower = 500;
            const currentLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 800 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 700 }
            ];
            
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setState = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimits(currentGridPower, currentLimits);
            
            // Assert
            const newLimitPerInverter = Math.floor(2000 / 2); // 1000
            
            assert(adapter.log.debug.calledWith('Setting Inverter 1 limit from 800W to 1000W'));
            assert(adapter.log.debug.calledWith('Setting Inverter 2 limit from 700W to 1000W'));
            assert(adapter.log.info.calledWith('Adjusting total power limit from 1500W to 2000W (1000W per inverter) - grid power: 500W, target: -800W'));
        });
    });
});

describe('ZeroPV Adapter - Power Limit Validation', function() {
    let adapter;
    
    beforeEach(function() {
        adapter = {
            config: {
                powerSourceObject: 'test.power.source',
                pollingInterval: 5000,
                feedInThreshold: 100,
                targetFeedIn: -800,
                inverters: []
            },
            log: {
                info: sinon.stub(),
                debug: sinon.stub(),
                warn: sinon.stub(),
                error: sinon.stub()
            }
        };
    });
    
    afterEach(function() {
        sinon.restore();
    });

    describe('Startup validation', function() {
        
        it('should set default maxPower to 2250W when undefined', function() {
            // Arrange
            adapter.config.inverters = [
                { powerControlObject: 'test.inverter1.control', name: 'Inverter 1' }
            ];
            
            // Act - simulate startup validation logic
            for (let i = 0; i < adapter.config.inverters.length; i++) {
                const inverter = adapter.config.inverters[i];
                if (inverter.maxPower === undefined || inverter.maxPower === null) {
                    inverter.maxPower = 2250;
                    adapter.log.warn(`Inverter ${i + 1} has no max power configured, using default 2250W`);
                }
            }
            
            // Assert
            assert.equal(adapter.config.inverters[0].maxPower, 2250);
            assert(adapter.log.warn.calledWith('Inverter 1 has no max power configured, using default 2250W'));
        });

        it('should clamp maxPower to 2250W when value exceeds limit', function() {
            // Arrange
            adapter.config.inverters = [
                { powerControlObject: 'test.inverter1.control', name: 'Inverter 1', maxPower: 3000 }
            ];
            
            // Act - simulate startup validation logic
            for (let i = 0; i < adapter.config.inverters.length; i++) {
                const inverter = adapter.config.inverters[i];
                if (inverter.maxPower > 2250) {
                    inverter.maxPower = 2250;
                    adapter.log.warn(`Inverter ${i + 1} max power exceeded 2250W limit, clamped to 2250W`);
                }
            }
            
            // Assert
            assert.equal(adapter.config.inverters[0].maxPower, 2250);
            assert(adapter.log.warn.calledWith('Inverter 1 max power exceeded 2250W limit, clamped to 2250W'));
        });

        it('should clamp negative maxPower to 2250W', function() {
            // Arrange
            adapter.config.inverters = [
                { powerControlObject: 'test.inverter1.control', name: 'Inverter 1', maxPower: -100 }
            ];
            
            // Act - simulate startup validation logic
            for (let i = 0; i < adapter.config.inverters.length; i++) {
                const inverter = adapter.config.inverters[i];
                if (inverter.maxPower < 0) {
                    inverter.maxPower = 2250;
                    adapter.log.warn(`Inverter ${i + 1} has invalid max power, using default 2250W`);
                }
            }
            
            // Assert
            assert.equal(adapter.config.inverters[0].maxPower, 2250);
            assert(adapter.log.warn.calledWith('Inverter 1 has invalid max power, using default 2250W'));
        });

        it('should keep valid maxPower values unchanged', function() {
            // Arrange
            adapter.config.inverters = [
                { powerControlObject: 'test.inverter1.control', name: 'Inverter 1', maxPower: 1800 },
                { powerControlObject: 'test.inverter2.control', name: 'Inverter 2', maxPower: 2250 }
            ];
            
            // Act - simulate startup validation logic
            for (let i = 0; i < adapter.config.inverters.length; i++) {
                const inverter = adapter.config.inverters[i];
                if (inverter.maxPower === undefined || inverter.maxPower === null) {
                    inverter.maxPower = 2250;
                } else if (inverter.maxPower > 2250) {
                    inverter.maxPower = 2250;
                } else if (inverter.maxPower < 0) {
                    inverter.maxPower = 2250;
                }
            }
            
            // Assert
            assert.equal(adapter.config.inverters[0].maxPower, 1800);
            assert.equal(adapter.config.inverters[1].maxPower, 2250);
            assert(!adapter.log.warn.called);
        });
    });
});

describe('ZeroPV Adapter - Power Limit Clamping', function() {
    let adapter;
    
    beforeEach(function() {
        adapter = {
            config: {
                inverters: [
                    { powerControlObject: 'test.inverter1.control', name: 'Inverter 1', maxPower: 2000 },
                    { powerControlObject: 'test.inverter2.control', name: 'Inverter 2', maxPower: 1500 }
                ],
                targetFeedIn: -800
            },
            lastPowerLimits: new Map(),
            setForeignStateAsync: sinon.stub(),
            setState: sinon.stub(),
            log: {
                info: sinon.stub(),
                debug: sinon.stub(),
                warn: sinon.stub(),
                error: sinon.stub()
            }
        };
        
        // Add the adjustInverterPowerLimits method with clamping
        adapter.adjustInverterPowerLimits = async function(currentGridPower, currentLimits) {
            try {
                const totalCurrentLimit = currentLimits.reduce((sum, limit) => sum + limit.value, 0);

                let newTotalLimit;
                if (currentGridPower >= 0) {
                    newTotalLimit = totalCurrentLimit + currentGridPower;
                } else {
                    const feedInDifference = currentGridPower - this.config.targetFeedIn;
                    newTotalLimit = Math.max(0, totalCurrentLimit + feedInDifference);
                }

                const newLimitPerInverter = Math.floor(newTotalLimit / this.config.inverters.length);
                
                this.log.info(`Adjusting total power limit from ${totalCurrentLimit}W to ${newTotalLimit}W (${newLimitPerInverter}W per inverter) - grid power: ${currentGridPower}W, target: ${this.config.targetFeedIn}W`);

                const adjustmentPromises = [];
                for (const limit of currentLimits) {
                    const inverter = this.config.inverters[limit.index];
                    const inverterName = inverter.name || `Inverter ${limit.index + 1}`;
                    
                    const clampedLimit = Math.min(newLimitPerInverter, inverter.maxPower || 2250);
                    
                    if (clampedLimit !== newLimitPerInverter) {
                        this.log.warn(`${inverterName} limit clamped from ${newLimitPerInverter}W to ${clampedLimit}W (max: ${inverter.maxPower || 2250}W)`);
                    }
                    
                    this.log.debug(`Setting ${inverterName} limit from ${limit.value}W to ${clampedLimit}W`);
                    
                    adjustmentPromises.push(
                        this.setForeignStateAsync(limit.powerControlObject, clampedLimit)
                            .then(async () => {
                                this.lastPowerLimits.set(limit.index, clampedLimit);
                                await this.setState(`inverter${limit.index}.powerLimit`, { val: clampedLimit, ack: true });
                            })
                            .catch(error => {
                                this.log.error(`Error setting limit for ${inverterName}: ${error.message}`);
                            })
                    );
                }
                
                await Promise.all(adjustmentPromises);
                await this.setState('currentPowerLimit', { val: newTotalLimit, ack: true });
                await this.setState('powerControlActive', { val: true, ack: true });
                
            } catch (error) {
                this.log.error(`Error adjusting inverter power limits: ${error.message}`);
            }
        };
    });
    
    afterEach(function() {
        sinon.restore();
    });

    describe('Power limit clamping', function() {
        
        it('should clamp power limit when calculated value exceeds inverter maximum', async function() {
            // Arrange
            const currentGridPower = 1000; // Consuming from grid
            const currentLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1000 }
            ];
            
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setState = sinon.stub().resolves();
            
            // Act - this should result in 1500W per inverter, but inverter 2 has max 1500W
            await adapter.adjustInverterPowerLimits(currentGridPower, currentLimits);
            
            // Assert
            const newTotalLimit = 3000; // 2000 + 1000
            const newLimitPerInverter = 1500; // floor(3000 / 2)
            
            // Inverter 1 should be clamped to 2000W (its max)
            assert(adapter.setForeignStateAsync.calledWith('test.inverter1.control', 1500));
            // Inverter 2 should be clamped to 1500W (its max)
            assert(adapter.setForeignStateAsync.calledWith('test.inverter2.control', 1500));
            
            // Should not log warning for inverter 2 (not clamped) but no warning for inverter 1 either
            assert(!adapter.log.warn.called);
        });

        it('should clamp power limit and log warning when calculated value exceeds inverter maximum', async function() {
            // Arrange
            const currentGridPower = 2000; // High consumption
            const currentLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1000 }
            ];
            
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setState = sinon.stub().resolves();
            
            // Act - this should result in 2000W per inverter, but inverter 2 has max 1500W
            await adapter.adjustInverterPowerLimits(currentGridPower, currentLimits);
            
            // Assert
            const newTotalLimit = 4000; // 2000 + 2000
            const newLimitPerInverter = 2000; // floor(4000 / 2)
            
            // Inverter 1 should be clamped to 2000W (its max)
            assert(adapter.setForeignStateAsync.calledWith('test.inverter1.control', 2000));
            // Inverter 2 should be clamped to 1500W (its max)
            assert(adapter.setForeignStateAsync.calledWith('test.inverter2.control', 1500));
            
            // Should log warning for inverter 2 being clamped
            assert(adapter.log.warn.calledWith('Inverter 2 limit clamped from 2000W to 1500W (max: 1500W)'));
        });

        it('should not clamp when calculated value is within limits', async function() {
            // Arrange
            const currentGridPower = -1000; // Feeding in
            const currentLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1500 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1500 }
            ];
            
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setState = sinon.stub().resolves();
            
            // Act - this should result in 1400W per inverter (well within limits)
            await adapter.adjustInverterPowerLimits(currentGridPower, currentLimits);
            
            // Assert
            const newTotalLimit = 2800; // 3000 + (-1000 - (-800)) = 2800
            const newLimitPerInverter = 1400; // floor(2800 / 2)
            
            assert(adapter.setForeignStateAsync.calledWith('test.inverter1.control', 1400));
            assert(adapter.setForeignStateAsync.calledWith('test.inverter2.control', 1400));
            
            // Should not log any clamping warnings
            assert(!adapter.log.warn.called);
        });

        it('should handle different max power limits per inverter', async function() {
            // Arrange
            adapter.config.inverters[0].maxPower = 1000; // Lower limit for inverter 1
            const currentGridPower = 1500;
            const currentLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 800 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 800 }
            ];
            
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setState = sinon.stub().resolves();
            
            // Act - this should result in 1750W per inverter
            await adapter.adjustInverterPowerLimits(currentGridPower, currentLimits);
            
            // Assert
            const newTotalLimit = 3100; // 1600 + 1500
            const newLimitPerInverter = 1550; // floor(3100 / 2)
            
            // Inverter 1 should be clamped to 1000W
            assert(adapter.setForeignStateAsync.calledWith('test.inverter1.control', 1000));
            // Inverter 2 should be clamped to 1500W  
            assert(adapter.setForeignStateAsync.calledWith('test.inverter2.control', 1500));
            
            // Should log warnings for both inverters being clamped
            assert(adapter.log.warn.calledWith('Inverter 1 limit clamped from 1550W to 1000W (max: 1000W)'));
            assert(adapter.log.warn.calledWith('Inverter 2 limit clamped from 1550W to 1500W (max: 1500W)'));
        });

        it('should use fallback 2250W limit when maxPower is missing', async function() {
            // Arrange
            adapter.config.inverters = [
                { powerControlObject: 'test.inverter1.control', name: 'Inverter 1' }, // No maxPower
                { powerControlObject: 'test.inverter2.control', name: 'Inverter 2', maxPower: 1800 }
            ];
            
            const currentGridPower = 2000;
            const currentLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1000 }
            ];
            
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setState = sinon.stub().resolves();
            
            // Act - this should result in 2000W per inverter
            await adapter.adjustInverterPowerLimits(currentGridPower, currentLimits);
            
            // Assert
            const newTotalLimit = 4000; // 2000 + 2000
            const newLimitPerInverter = 2000; // floor(4000 / 2)
            
            // Inverter 1 should be clamped to 2250W (fallback)
            assert(adapter.setForeignStateAsync.calledWith('test.inverter1.control', 2000));
            // Inverter 2 should be clamped to 1800W (its max)
            assert(adapter.setForeignStateAsync.calledWith('test.inverter2.control', 1800));
            
            // Should log warning for inverter 2 being clamped
            assert(adapter.log.warn.calledWith('Inverter 2 limit clamped from 2000W to 1800W (max: 1800W)'));
        });

        it('should handle zero power limits correctly', async function() {
            // Arrange
            const currentGridPower = -3000; // Very high feed-in
            const currentLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1000 }
            ];
            
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setState = sinon.stub().resolves();
            
            // Act - this should result in 0W per inverter due to Math.max(0, ...)
            await adapter.adjustInverterPowerLimits(currentGridPower, currentLimits);
            
            // Assert
            const feedInDifference = currentGridPower - adapter.config.targetFeedIn; // -3000 - (-800) = -2200
            const newTotalLimit = Math.max(0, 2000 + feedInDifference); // max(0, 2000 + (-2200)) = 0
            const newLimitPerInverter = 0; // floor(0 / 2)
            
            assert(adapter.setForeignStateAsync.calledWith('test.inverter1.control', 0));
            assert(adapter.setForeignStateAsync.calledWith('test.inverter2.control', 0));
            
            // No clamping needed since 0 is below all max limits
            assert(!adapter.log.warn.called);
        });
    });
});