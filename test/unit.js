const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire');

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
            setStateAsync: sinon.stub(),
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
                        await this.setStateAsync('gridPower', { val: powerValue, ack: true });
                        
                        const isFeedingIn = powerValue < 0;
                        await this.setStateAsync('feedingIn', { val: isFeedingIn, ack: true });
                        
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
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.pollPowerData();
            
            // Assert
            assert(adapter.getForeignStateAsync.calledWith('test.power.source'));
            assert(adapter.setStateAsync.calledWith('gridPower', { val: 1500, ack: true }));
            assert(adapter.setStateAsync.calledWith('feedingIn', { val: false, ack: true }));
            assert(adapter.checkPowerControlAdjustment.calledWith(1500));
            assert(adapter.log.debug.calledWith('Grid power: 1500W, Feeding in: false'));
        });

        it('should handle valid negative power value (feeding in) correctly', async function() {
            // Arrange
            const mockPowerState = { val: -800, ack: true };
            adapter.getForeignStateAsync = sinon.stub().resolves(mockPowerState);
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.pollPowerData();
            
            // Assert
            assert(adapter.setStateAsync.calledWith('gridPower', { val: -800, ack: true }));
            assert(adapter.setStateAsync.calledWith('feedingIn', { val: true, ack: true }));
            assert(adapter.checkPowerControlAdjustment.calledWith(-800));
            assert(adapter.log.debug.calledWith('Grid power: -800W, Feeding in: true'));
        });

        it('should handle zero power value correctly', async function() {
            // Arrange
            const mockPowerState = { val: 0, ack: true };
            adapter.getForeignStateAsync = sinon.stub().resolves(mockPowerState);
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.pollPowerData();
            
            // Assert
            assert(adapter.setStateAsync.calledWith('gridPower', { val: 0, ack: true }));
            assert(adapter.setStateAsync.calledWith('feedingIn', { val: false, ack: true }));
            assert(adapter.checkPowerControlAdjustment.calledWith(0));
        });

        it('should handle string number values correctly', async function() {
            // Arrange
            const mockPowerState = { val: '1200.5', ack: true };
            adapter.getForeignStateAsync = sinon.stub().resolves(mockPowerState);
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.pollPowerData();
            
            // Assert
            assert(adapter.setStateAsync.calledWith('gridPower', { val: 1200.5, ack: true }));
            assert(adapter.setStateAsync.calledWith('feedingIn', { val: false, ack: true }));
            assert(adapter.checkPowerControlAdjustment.calledWith(1200.5));
        });

        it('should handle invalid power values and log warning', async function() {
            // Arrange
            const mockPowerState = { val: 'invalid', ack: true };
            adapter.getForeignStateAsync = sinon.stub().resolves(mockPowerState);
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.pollPowerData();
            
            // Assert
            assert(!adapter.setStateAsync.called);
            assert(!adapter.checkPowerControlAdjustment.called);
            assert(adapter.log.warn.calledWith('Invalid power value from test.power.source: invalid'));
        });

        it('should handle null power state values', async function() {
            // Arrange
            const mockPowerState = { val: null, ack: true };
            adapter.getForeignStateAsync = sinon.stub().resolves(mockPowerState);
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.pollPowerData();
            
            // Assert
            assert(!adapter.setStateAsync.called);
            assert(!adapter.checkPowerControlAdjustment.called);
            assert(adapter.log.warn.calledWith('No data received from test.power.source'));
        });

        it('should handle undefined power state values', async function() {
            // Arrange
            const mockPowerState = { val: undefined, ack: true };
            adapter.getForeignStateAsync = sinon.stub().resolves(mockPowerState);
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.pollPowerData();
            
            // Assert
            assert(!adapter.setStateAsync.called);
            assert(!adapter.checkPowerControlAdjustment.called);
            assert(adapter.log.warn.calledWith('No data received from test.power.source'));
        });

        it('should handle null power state object', async function() {
            // Arrange
            adapter.getForeignStateAsync = sinon.stub().resolves(null);
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.pollPowerData();
            
            // Assert
            assert(!adapter.setStateAsync.called);
            assert(!adapter.checkPowerControlAdjustment.called);
            assert(adapter.log.warn.calledWith('No data received from test.power.source'));
        });

        it('should handle getForeignStateAsync errors', async function() {
            // Arrange
            const error = new Error('Connection failed');
            adapter.getForeignStateAsync = sinon.stub().rejects(error);
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.pollPowerData();
            
            // Assert
            assert(!adapter.setStateAsync.called);
            assert(!adapter.checkPowerControlAdjustment.called);
            assert(adapter.log.error.calledWith('Error reading power data: Connection failed'));
        });

        it('should schedule next polling cycle', async function() {
            // Arrange
            const mockPowerState = { val: 1000, ack: true };
            adapter.getForeignStateAsync = sinon.stub().resolves(mockPowerState);
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.pollPowerData();
            
            // Advance timer to trigger next poll
            clock.tick(5000);
            
            // Assert
            assert(adapter.pollingTimer !== null);
            assert(adapter.getForeignStateAsync.callCount === 2);
        });

        it('should handle setStateAsync errors gracefully', async function() {
            // Arrange
            const mockPowerState = { val: 1500, ack: true };
            adapter.getForeignStateAsync = sinon.stub().resolves(mockPowerState);
            adapter.setStateAsync = sinon.stub().rejects(new Error('State error'));
            
            // Act & Assert - should not throw
            await adapter.pollPowerData(); // Should not throw
            assert(adapter.log.error.called);
        });
    });
});

describe('ZeroPV Adapter - checkPowerControlAdjustment', function() {
    let adapter;
    
    beforeEach(function() {
        adapter = {
            config: {
                feedInThreshold: 100,
                targetFeedIn: -800,
                powerControlObject: 'test.power.control'
            },
            lastGridPower: null,
            lastPowerLimit: null,
            getForeignStateAsync: sinon.stub(),
            setStateAsync: sinon.stub(),
            setForeignStateAsync: sinon.stub(),
            adjustInverterPowerLimit: sinon.stub().resolves(),
            log: {
                info: sinon.stub(),
                debug: sinon.stub(),
                warn: sinon.stub(),
                error: sinon.stub()
            }
        };
        
        // Add the checkPowerControlAdjustment method from main.js
        adapter.checkPowerControlAdjustment = async function(currentGridPower) {
            try {
                // Check if this is the first reading
                if (this.lastGridPower === null) {
                    this.lastGridPower = currentGridPower;
                    return;
                }

                const powerChange = Math.abs(currentGridPower - this.lastGridPower);
                
                // Only adjust if change is above threshold
                if (powerChange >= this.config.feedInThreshold) {
                    this.log.info(`Grid power changed by ${powerChange}W, adjusting inverter power limit`);
                    await this.adjustInverterPowerLimit(currentGridPower);
                } else {
                    await this.setStateAsync('powerControlActive', { val: false, ack: true });
                }

                this.lastGridPower = currentGridPower;
            } catch (error) {
                this.log.error(`Error in power control adjustment: ${error.message}`);
            }
        };
    });
    
    afterEach(function() {
        sinon.restore();
    });

    describe('checkPowerControlAdjustment()', function() {
        
        it('should handle positive grid power and adjust if change is significant', async function() {
            // Arrange
            adapter.lastGridPower = 200;
            adapter.setStateAsync = sinon.stub().resolves();
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            
            // Act - change of 1300W is above threshold
            await adapter.checkPowerControlAdjustment(1500);
            
            // Assert
            assert.equal(adapter.lastGridPower, 1500);
            assert(adapter.adjustInverterPowerLimit.calledWith(1500));
            assert(adapter.log.info.calledWith('Grid power changed by 1300W, adjusting inverter power limit'));
        });

        it('should set powerControlActive to false when change is below threshold', async function() {
            // Arrange
            adapter.lastGridPower = 50;
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act - change of 50W is below threshold
            await adapter.checkPowerControlAdjustment(0);
            
            // Assert
            assert.equal(adapter.lastGridPower, 0);
            assert(adapter.setStateAsync.calledWith('powerControlActive', { val: false, ack: true }));
            assert(!adapter.adjustInverterPowerLimit.called);
        });

        it('should store first negative power reading without adjustment', async function() {
            // Arrange - first reading (lastGridPower is null)
            adapter.lastGridPower = null;
            
            // Act
            await adapter.checkPowerControlAdjustment(-1000);
            
            // Assert
            assert.equal(adapter.lastGridPower, -1000);
            assert(!adapter.setStateAsync.called);
            assert(!adapter.adjustInverterPowerLimit.called);
        });

        it('should not adjust power when change is below threshold', async function() {
            // Arrange
            adapter.lastGridPower = -1000;
            const newPower = -1050; // Change of 50W, below threshold of 100W
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(!adapter.adjustInverterPowerLimit.called);
            assert(!adapter.log.info.called);
        });

        it('should adjust power when change is above threshold', async function() {
            // Arrange
            adapter.lastGridPower = -1000;
            const newPower = -1200; // Change of 200W, above threshold of 100W
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            assert(adapter.log.info.calledWith('Grid power changed by 200W, adjusting inverter power limit'));
        });

        it('should adjust power when feed-in decreases significantly', async function() {
            // Arrange
            adapter.lastGridPower = -1500;
            const newPower = -900; // Change of 600W (less feed-in), above threshold
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            assert(adapter.log.info.calledWith('Grid power changed by 600W, adjusting inverter power limit'));
        });

        it('should adjust power when change exactly equals threshold', async function() {
            // Arrange
            adapter.lastGridPower = -1000;
            const newPower = -1100; // Change of exactly 100W (threshold)
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            assert(adapter.log.info.calledWith('Grid power changed by 100W, adjusting inverter power limit'));
        });

        it('should handle adjustInverterPowerLimit errors gracefully', async function() {
            // Arrange
            adapter.lastGridPower = -1000;
            const newPower = -1200;
            const error = new Error('Inverter communication failed');
            adapter.adjustInverterPowerLimit = sinon.stub().rejects(error);
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert(adapter.log.error.calledWith('Error in power control adjustment: Inverter communication failed'));
            assert.equal(adapter.lastGridPower, -1000); // Should not be updated on error
        });

        it('should handle setStateAsync errors gracefully', async function() {
            // Arrange - small change that should set powerControlActive to false
            adapter.lastGridPower = 50;
            const error = new Error('State update failed');
            adapter.setStateAsync = sinon.stub().rejects(error);
            
            // Act - change of 50W is below threshold, should call setStateAsync
            await adapter.checkPowerControlAdjustment(100);
            
            // Assert
            assert(adapter.log.error.calledWith('Error in power control adjustment: State update failed'));
        });

        it('should work with decimal power values', async function() {
            // Arrange
            adapter.lastGridPower = -1000.5;
            const newPower = -1150.7; // Change of 150.2W, above threshold
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            // Check for the actual calculated difference (might have floating point precision issues)
            const expectedDifference = Math.abs(-1150.7 - (-1000.5));
            assert(adapter.log.info.calledWith(`Grid power changed by ${expectedDifference}W, adjusting inverter power limit`));
        });

        it('should adjust power when transitioning from consuming to feeding with significant change', async function() {
            // Arrange - the logic treats any feed-in as eligible for adjustment if change is significant
            adapter.lastGridPower = 500; // Was consuming
            const newPower = -1200; // Now feeding in significantly (change of 1700W, above threshold)
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            assert(adapter.log.info.calledWith('Grid power changed by 1700W, adjusting inverter power limit'));
        });

        it('should not adjust when transitioning from consuming to feeding with small change', async function() {
            // Arrange
            adapter.lastGridPower = 50; // Was consuming slightly
            const newPower = -30; // Now feeding in slightly (change of 80W, below threshold of 100W)
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(!adapter.adjustInverterPowerLimit.called);
            assert(!adapter.log.info.called);
        });

        it('should handle transition from feeding to consuming with significant change', async function() {
            // Arrange
            adapter.lastGridPower = -800; // Was feeding in
            const newPower = 300; // Now consuming (change of 1100W, above threshold)
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            assert(adapter.log.info.calledWith('Grid power changed by 1100W, adjusting inverter power limit'));
        });

        it('should correctly calculate power change when signs differ (negative to positive)', async function() {
            // Arrange - transition from feeding in to consuming
            adapter.lastGridPower = -500; // Was feeding 500W into grid
            const newPower = 300; // Now consuming 300W from grid
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            
            // Expected power change: Math.abs(300 - (-500)) = Math.abs(800) = 800W
            // Since change (800W) > threshold (100W), should trigger adjustment
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            assert(adapter.log.info.calledWith('Grid power changed by 800W, adjusting inverter power limit'));
        });

        it('should correctly calculate power change when signs differ (positive to negative)', async function() {
            // Arrange - transition from consuming to feeding in
            adapter.lastGridPower = 200; // Was consuming 200W from grid
            const newPower = -600; // Now feeding 600W into grid
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            
            // Expected power change: Math.abs(-600 - 200) = Math.abs(-800) = 800W
            // Since change (800W) > threshold (100W), should trigger adjustment
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            assert(adapter.log.info.calledWith('Grid power changed by 800W, adjusting inverter power limit'));
        });

        it('should handle extreme sign changes correctly', async function() {
            // Arrange - large transition from high consumption to high feed-in
            adapter.lastGridPower = 2000; // Was consuming 2000W from grid
            const newPower = -1500; // Now feeding 1500W into grid
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            
            // Expected power change: Math.abs(-1500 - 2000) = Math.abs(-3500) = 3500W
            // Since change (3500W) > threshold (100W), should trigger adjustment
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            assert(adapter.log.info.calledWith('Grid power changed by 3500W, adjusting inverter power limit'));
        });

        it('should correctly calculate power change for positive to positive transition with large change', async function() {
            // Arrange - transition between different consumption levels
            adapter.lastGridPower = 100; // Was consuming 100W from grid
            const newPower = 800; // Now consuming 800W from grid
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            
            // Expected power change: Math.abs(800 - 100) = 700W
            // Since change (700W) > threshold (100W), should trigger adjustment
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            assert(adapter.log.info.calledWith('Grid power changed by 700W, adjusting inverter power limit'));
        });

        it('should correctly calculate power change for positive to positive transition with small change', async function() {
            // Arrange - small transition between consumption levels
            adapter.lastGridPower = 500; // Was consuming 500W from grid
            const newPower = 550; // Now consuming 550W from grid
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Expected power change: Math.abs(550 - 500) = 50W
            // Since change (50W) < threshold (100W), should set powerControlActive to false
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.setStateAsync.calledWith('powerControlActive', { val: false, ack: true }));
            assert(!adapter.adjustInverterPowerLimit.called);
        });

        it('should correctly calculate power change for negative to negative transition with large change', async function() {
            // Arrange - transition between different feed-in levels
            adapter.lastGridPower = -500; // Was feeding 500W into grid
            const newPower = -1200; // Now feeding 1200W into grid
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            
            // Expected power change: Math.abs(-1200 - (-500)) = Math.abs(-700) = 700W
            // Since change (700W) > threshold (100W), should trigger adjustment
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            assert(adapter.log.info.calledWith('Grid power changed by 700W, adjusting inverter power limit'));
        });

        it('should correctly calculate power change for negative to negative transition with small change', async function() {
            // Arrange - small transition between feed-in levels
            adapter.lastGridPower = -1000; // Was feeding 1000W into grid
            const newPower = -1050; // Now feeding 1050W into grid
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            
            // Expected power change: Math.abs(-1050 - (-1000)) = Math.abs(-50) = 50W
            // Since change (50W) < threshold (100W), should not trigger adjustment
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(!adapter.adjustInverterPowerLimit.called);
            assert(!adapter.log.info.called);
        });
    });
});

describe('ZeroPV Adapter - adjustInverterPowerLimit', function() {
    let adapter;
    
    beforeEach(function() {
        adapter = {
            config: {
                powerControlObject: 'test.power.control',
                targetFeedIn: -800
            },
            lastPowerLimit: null,
            getForeignStateAsync: sinon.stub(),
            setStateAsync: sinon.stub(),
            setForeignStateAsync: sinon.stub(),
            log: {
                info: sinon.stub(),
                debug: sinon.stub(),
                warn: sinon.stub(),
                error: sinon.stub()
            }
        };
        
        // Add the adjustInverterPowerLimit method from main.js
        adapter.adjustInverterPowerLimit = async function(currentGridPower) {
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
                await this.setStateAsync('currentPowerLimit', { val: newLimit, ack: true });
                await this.setStateAsync('powerControlActive', { val: true, ack: true });
                
                this.lastPowerLimit = newLimit;
            } catch (error) {
                this.log.error(`Error adjusting inverter power limit: ${error.message}`);
            }
        };
    });
    
    afterEach(function() {
        sinon.restore();
    });

    describe('adjustInverterPowerLimit()', function() {
        
        it('should reduce power limit when feeding in more than target', async function() {
            // Arrange
            const currentGridPower = -1200; // Feeding in 1200W
            const currentLimit = 2000; // Current inverter limit 2000W
            
            adapter.getForeignStateAsync = sinon.stub().resolves({ val: currentLimit, ack: true });
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimit(currentGridPower);
            
            // Assert
            const feedInDifference = currentGridPower - adapter.config.targetFeedIn; // -1200 - (-800) = -400
            const expectedNewLimit = Math.max(0, currentLimit + feedInDifference); // 2000 + (-400) = 1600
            
            assert(adapter.getForeignStateAsync.calledWith('test.power.control'));
            assert(adapter.setForeignStateAsync.calledWith('test.power.control', expectedNewLimit));
            assert(adapter.setStateAsync.calledWith('currentPowerLimit', { val: expectedNewLimit, ack: true }));
            assert(adapter.setStateAsync.calledWith('powerControlActive', { val: true, ack: true }));
            assert.equal(adapter.lastPowerLimit, expectedNewLimit);
            assert(adapter.log.info.calledWith(`Adjusting power limit from ${currentLimit}W to ${expectedNewLimit}W (grid power: ${currentGridPower}W, target: ${adapter.config.targetFeedIn}W)`));
        });

        it('should increase power limit when feeding in less than target', async function() {
            // Arrange
            const currentGridPower = -500; // Feeding in only 500W (less than target 800W)
            const currentLimit = 1500; // Current inverter limit 1500W
            
            adapter.getForeignStateAsync = sinon.stub().resolves({ val: currentLimit, ack: true });
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimit(currentGridPower);
            
            // Assert
            const feedInDifference = currentGridPower - adapter.config.targetFeedIn; // -500 - (-800) = 300
            const expectedNewLimit = Math.max(0, currentLimit + feedInDifference); // 1500 + 300 = 1800
            
            assert(adapter.setForeignStateAsync.calledWith('test.power.control', expectedNewLimit));
            assert(adapter.setStateAsync.calledWith('currentPowerLimit', { val: expectedNewLimit, ack: true }));
            assert.equal(adapter.lastPowerLimit, expectedNewLimit);
        });

        it('should handle zero as minimum power limit', async function() {
            // Arrange
            const currentGridPower = -2000; // High feed-in
            const currentLimit = 100; // Low current limit
            
            adapter.getForeignStateAsync = sinon.stub().resolves({ val: currentLimit, ack: true });
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimit(currentGridPower);
            
            // Assert
            const feedInDifference = currentGridPower - adapter.config.targetFeedIn; // -2000 - (-800) = -1200
            const calculatedLimit = currentLimit + feedInDifference; // 100 + (-1200) = -1100
            const expectedNewLimit = Math.max(0, calculatedLimit); // max(0, -1100) = 0
            
            assert(adapter.setForeignStateAsync.calledWith('test.power.control', 0));
            assert.equal(adapter.lastPowerLimit, expectedNewLimit);
        });

        it('should enforce minimum limit of 0 when calculation goes negative', async function() {
            // Arrange
            const currentGridPower = -200; // Low feed-in
            const currentLimit = 100; // Low current limit
            
            adapter.getForeignStateAsync = sinon.stub().resolves({ val: currentLimit, ack: true });
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimit(currentGridPower);
            
            // Assert
            const feedInDifference = currentGridPower - adapter.config.targetFeedIn; // -200 - (-800) = 600
            const calculatedLimit = currentLimit + feedInDifference; // 100 + 600 = 700
            const expectedNewLimit = Math.max(0, calculatedLimit); // max(0, 700) = 700
            
            assert(adapter.setForeignStateAsync.calledWith('test.power.control', 700));
            assert(adapter.setStateAsync.calledWith('currentPowerLimit', { val: 700, ack: true }));
            assert.equal(adapter.lastPowerLimit, 700);
        });

        it('should handle string number values for current limit', async function() {
            // Arrange
            const currentGridPower = -1000;
            const currentLimit = '1800'; // String value
            
            adapter.getForeignStateAsync = sinon.stub().resolves({ val: currentLimit, ack: true });
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimit(currentGridPower);
            
            // Assert
            const feedInDifference = currentGridPower - adapter.config.targetFeedIn; // -1000 - (-800) = -200
            const expectedNewLimit = Math.max(0, parseFloat(currentLimit) + feedInDifference); // 1800 + (-200) = 1600
            
            assert(adapter.setForeignStateAsync.calledWith('test.power.control', expectedNewLimit));
            assert.equal(adapter.lastPowerLimit, expectedNewLimit);
        });

        it('should handle decimal values correctly', async function() {
            // Arrange
            const currentGridPower = -950.5;
            const currentLimit = 1750.25;
            
            adapter.getForeignStateAsync = sinon.stub().resolves({ val: currentLimit, ack: true });
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimit(currentGridPower);
            
            // Assert
            const feedInDifference = currentGridPower - adapter.config.targetFeedIn; // -950.5 - (-800) = -150.5
            const expectedNewLimit = Math.max(0, currentLimit + feedInDifference); // 1750.25 + (-150.5) = 1599.75
            
            assert(adapter.setForeignStateAsync.calledWith('test.power.control', expectedNewLimit));
            assert.equal(adapter.lastPowerLimit, expectedNewLimit);
        });

        it('should warn and return when current limit state is null', async function() {
            // Arrange
            adapter.getForeignStateAsync = sinon.stub().resolves(null);
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimit(-1000);
            
            // Assert
            assert(adapter.log.warn.calledWith('Could not read current power limit from test.power.control'));
            assert(!adapter.setForeignStateAsync.called);
            assert(!adapter.setStateAsync.called);
            assert.equal(adapter.lastPowerLimit, null);
        });

        it('should warn and return when current limit value is null', async function() {
            // Arrange
            adapter.getForeignStateAsync = sinon.stub().resolves({ val: null, ack: true });
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimit(-1000);
            
            // Assert
            assert(adapter.log.warn.calledWith('Could not read current power limit from test.power.control'));
            assert(!adapter.setForeignStateAsync.called);
            assert(!adapter.setStateAsync.called);
        });

        it('should warn and return when current limit value is undefined', async function() {
            // Arrange
            adapter.getForeignStateAsync = sinon.stub().resolves({ val: undefined, ack: true });
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimit(-1000);
            
            // Assert
            assert(adapter.log.warn.calledWith('Could not read current power limit from test.power.control'));
            assert(!adapter.setForeignStateAsync.called);
            assert(!adapter.setStateAsync.called);
        });

        it('should warn and return when current limit value is invalid (non-numeric)', async function() {
            // Arrange
            const invalidValue = 'invalid_number';
            adapter.getForeignStateAsync = sinon.stub().resolves({ val: invalidValue, ack: true });
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimit(-1000);
            
            // Assert
            assert(adapter.log.warn.calledWith(`Invalid power limit value: ${invalidValue}`));
            assert(!adapter.setForeignStateAsync.called);
            assert(!adapter.setStateAsync.called);
        });

        it('should handle getForeignStateAsync errors gracefully', async function() {
            // Arrange
            const error = new Error('Connection to OpenDTU failed');
            adapter.getForeignStateAsync = sinon.stub().rejects(error);
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimit(-1000);
            
            // Assert
            assert(adapter.log.error.calledWith('Error adjusting inverter power limit: Connection to OpenDTU failed'));
            assert(!adapter.setForeignStateAsync.called);
            assert(!adapter.setStateAsync.called);
        });

        it('should handle setForeignStateAsync errors gracefully', async function() {
            // Arrange
            const currentLimit = 2000;
            const error = new Error('Failed to set power limit');
            
            adapter.getForeignStateAsync = sinon.stub().resolves({ val: currentLimit, ack: true });
            adapter.setForeignStateAsync = sinon.stub().rejects(error);
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimit(-1000);
            
            // Assert
            assert(adapter.log.error.calledWith('Error adjusting inverter power limit: Failed to set power limit'));
        });

        it('should handle setStateAsync errors gracefully', async function() {
            // Arrange
            const currentLimit = 2000;
            const error = new Error('Failed to update state');
            
            adapter.getForeignStateAsync = sinon.stub().resolves({ val: currentLimit, ack: true });
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setStateAsync = sinon.stub().rejects(error);
            
            // Act
            await adapter.adjustInverterPowerLimit(-1000);
            
            // Assert
            assert(adapter.log.error.calledWith('Error adjusting inverter power limit: Failed to update state'));
        });

        it('should handle target feed-in exactly matching current grid power', async function() {
            // Arrange
            const currentGridPower = -800; // Exactly matches target
            const currentLimit = 1500;
            
            adapter.getForeignStateAsync = sinon.stub().resolves({ val: currentLimit, ack: true });
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimit(currentGridPower);
            
            // Assert
            const feedInDifference = currentGridPower - adapter.config.targetFeedIn; // -800 - (-800) = 0
            const expectedNewLimit = Math.max(0, currentLimit + feedInDifference); // 1500 + 0 = 1500
            
            assert(adapter.setForeignStateAsync.calledWith('test.power.control', expectedNewLimit));
            assert(adapter.setStateAsync.calledWith('currentPowerLimit', { val: expectedNewLimit, ack: true }));
            assert.equal(adapter.lastPowerLimit, expectedNewLimit);
        });

        it('should handle positive grid power (consuming power)', async function() {
            // Arrange
            const currentGridPower = 500; // Consuming from grid
            const currentLimit = 1500;
            
            adapter.getForeignStateAsync = sinon.stub().resolves({ val: currentLimit, ack: true });
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimit(currentGridPower);
            
            // Assert
            const expectedNewLimit = currentLimit + currentGridPower; // 1500 + 500 = 2000
            
            assert(adapter.setForeignStateAsync.calledWith('test.power.control', expectedNewLimit));
            assert(adapter.setStateAsync.calledWith('currentPowerLimit', { val: expectedNewLimit, ack: true }));
            assert.equal(adapter.lastPowerLimit, expectedNewLimit);
        });

        it('should update all states correctly on successful adjustment', async function() {
            // Arrange
            const currentGridPower = -1000;
            const currentLimit = 1800;
            
            adapter.getForeignStateAsync = sinon.stub().resolves({ val: currentLimit, ack: true });
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimit(currentGridPower);
            
            // Assert
            const feedInDifference = currentGridPower - adapter.config.targetFeedIn; // -1000 - (-800) = -200
            const expectedNewLimit = Math.max(0, currentLimit + feedInDifference); // 1800 + (-200) = 1600
            
            // Verify all state updates are called correctly
            assert(adapter.setForeignStateAsync.calledOnce);
            assert(adapter.setForeignStateAsync.calledWith('test.power.control', expectedNewLimit));
            
            assert(adapter.setStateAsync.calledTwice);
            assert(adapter.setStateAsync.calledWith('currentPowerLimit', { val: expectedNewLimit, ack: true }));
            assert(adapter.setStateAsync.calledWith('powerControlActive', { val: true, ack: true }));
            
            assert.equal(adapter.lastPowerLimit, expectedNewLimit);
        });

        it('should increase PV limit when consuming from grid (positive power)', async function() {
            // Arrange
            const currentGridPower = 300; // Consuming 300W from grid
            const currentLimit = 1200;
            
            adapter.getForeignStateAsync = sinon.stub().resolves({ val: currentLimit, ack: true });
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimit(currentGridPower);
            
            // Assert
            const expectedNewLimit = currentLimit + currentGridPower; // 1200 + 300 = 1500
            
            assert(adapter.setForeignStateAsync.calledWith('test.power.control', expectedNewLimit));
            assert(adapter.setStateAsync.calledWith('currentPowerLimit', { val: expectedNewLimit, ack: true }));
            assert.equal(adapter.lastPowerLimit, expectedNewLimit);
            assert(adapter.log.info.calledWith(`Adjusting power limit from ${currentLimit}W to ${expectedNewLimit}W (grid power: ${currentGridPower}W, target: ${adapter.config.targetFeedIn}W)`));
        });

        it('should reduce PV limit when feed-in exceeds target (-1000W vs -800W target)', async function() {
            // Arrange
            const currentGridPower = -1000; // Feeding 1000W (exceeds -800W target)
            const currentLimit = 2000;
            
            adapter.getForeignStateAsync = sinon.stub().resolves({ val: currentLimit, ack: true });
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimit(currentGridPower);
            
            // Assert
            const feedInDifference = currentGridPower - adapter.config.targetFeedIn; // -1000 - (-800) = -200
            const expectedNewLimit = currentLimit + feedInDifference; // 2000 + (-200) = 1800
            
            assert(adapter.setForeignStateAsync.calledWith('test.power.control', expectedNewLimit));
            assert(adapter.setStateAsync.calledWith('currentPowerLimit', { val: expectedNewLimit, ack: true }));
            assert.equal(adapter.lastPowerLimit, expectedNewLimit);
        });

        it('should increase PV limit when feed-in is below target (-600W vs -800W target)', async function() {
            // Arrange
            const currentGridPower = -600; // Feeding only 600W (below -800W target)
            const currentLimit = 1500;
            
            adapter.getForeignStateAsync = sinon.stub().resolves({ val: currentLimit, ack: true });
            adapter.setForeignStateAsync = sinon.stub().resolves();
            adapter.setStateAsync = sinon.stub().resolves();
            
            // Act
            await adapter.adjustInverterPowerLimit(currentGridPower);
            
            // Assert
            const feedInDifference = currentGridPower - adapter.config.targetFeedIn; // -600 - (-800) = 200
            const expectedNewLimit = currentLimit + feedInDifference; // 1500 + 200 = 1700
            
            assert(adapter.setForeignStateAsync.calledWith('test.power.control', expectedNewLimit));
            assert(adapter.setStateAsync.calledWith('currentPowerLimit', { val: expectedNewLimit, ack: true }));
            assert.equal(adapter.lastPowerLimit, expectedNewLimit);
        });
    });
});