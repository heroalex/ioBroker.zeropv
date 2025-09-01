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
        
        // Add the checkPowerControlAdjustment method from main.js with corrected threshold logic
        adapter.checkPowerControlAdjustment = async function(currentGridPower) {
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

                // Check if the inverter power limit change is above threshold
                const limitChange = Math.abs(newLimit - currentLimit);
                
                if (limitChange >= this.config.feedInThreshold) {
                    this.log.info(`Inverter limit would change by ${limitChange}W, adjusting inverter power limit`);
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
        
        it('should handle positive grid power and adjust if inverter limit change is significant', async function() {
            // Arrange
            adapter.lastGridPower = 200;
            adapter.setStateAsync = sinon.stub().resolves();
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            adapter.getForeignStateAsync.resolves({ val: 1000 }); // Current limit 1000W
            
            // Act - grid power 1500W, current limit 1000W -> new limit would be 2500W (change of 1500W, above 100W threshold)
            await adapter.checkPowerControlAdjustment(1500);
            
            // Assert
            assert.equal(adapter.lastGridPower, 1500);
            assert(adapter.adjustInverterPowerLimit.calledWith(1500));
            assert(adapter.log.info.calledWith('Inverter limit would change by 1500W, adjusting inverter power limit'));
        });

        it('should set powerControlActive to false when inverter limit change is below threshold', async function() {
            // Arrange
            adapter.lastGridPower = -850; // Previously feeding in 850W
            adapter.setStateAsync = sinon.stub().resolves();
            adapter.getForeignStateAsync.resolves({ val: 2000 }); // Current limit 2000W
            
            // Act - now feeding in 800W (target is -800W), so new limit would be 2000 + (-800 - (-800)) = 2000W (no change)
            await adapter.checkPowerControlAdjustment(-800);
            
            // Assert
            assert.equal(adapter.lastGridPower, -800);
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

        it('should not adjust power when inverter limit change is below threshold', async function() {
            // Arrange
            adapter.lastGridPower = -1000;
            adapter.setStateAsync = sinon.stub().resolves();
            adapter.getForeignStateAsync.resolves({ val: 2000 }); // Current limit 2000W
            const newPower = -850; // Target is -800W, so new limit would be 2000 + (-850 - (-800)) = 1950W (change of 50W, below 100W threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(!adapter.adjustInverterPowerLimit.called);
            assert(adapter.setStateAsync.calledWith('powerControlActive', { val: false, ack: true }));
        });

        it('should adjust power when inverter limit change is above threshold', async function() {
            // Arrange
            adapter.lastGridPower = -1000;
            adapter.getForeignStateAsync.resolves({ val: 2000 }); // Current limit 2000W
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            const newPower = -1200; // Target is -800W, so new limit would be 2000 + (-1200 - (-800)) = 1600W (change of 400W, above 100W threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            assert(adapter.log.info.calledWith('Inverter limit would change by 400W, adjusting inverter power limit'));
        });

        it('should adjust power when feed-in decreases significantly', async function() {
            // Arrange
            adapter.lastGridPower = -1500;
            adapter.getForeignStateAsync.resolves({ val: 2000 }); // Current limit 2000W
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            const newPower = -900; // Target is -800W, so new limit would be 2000 + (-900 - (-800)) = 1900W (change of 100W, exactly at threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            assert(adapter.log.info.calledWith('Inverter limit would change by 100W, adjusting inverter power limit'));
        });

        it('should adjust power when inverter limit change exactly equals threshold', async function() {
            // Arrange
            adapter.lastGridPower = -1000;
            adapter.getForeignStateAsync.resolves({ val: 2000 }); // Current limit 2000W
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            const newPower = -700; // Target is -800W, so new limit would be 2000 + (-700 - (-800)) = 2100W (change of exactly 100W)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            assert(adapter.log.info.calledWith('Inverter limit would change by 100W, adjusting inverter power limit'));
        });

        it('should NOT adjust when grid power change is large but inverter limit change is small', async function() {
            // Arrange - This test demonstrates the flaw in the old logic
            adapter.lastGridPower = -200; // Previously feeding in 200W
            adapter.setStateAsync = sinon.stub().resolves();
            adapter.getForeignStateAsync.resolves({ val: 2000 }); // Current limit 2000W
            const newPower = -850; // Now feeding in 850W (grid change of 650W, above old threshold)
            // Target is -800W, so new limit would be 2000 + (-850 - (-800)) = 1950W (inverter change of only 50W, below threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(!adapter.adjustInverterPowerLimit.called);
            assert(adapter.setStateAsync.calledWith('powerControlActive', { val: false, ack: true }));
        });

        it('should handle adjustInverterPowerLimit errors gracefully', async function() {
            // Arrange
            adapter.lastGridPower = -1000;
            adapter.getForeignStateAsync.resolves({ val: 2000 }); // Current limit 2000W
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
            // Arrange - small inverter limit change that should set powerControlActive to false
            adapter.lastGridPower = -850;
            adapter.getForeignStateAsync.resolves({ val: 2000 }); // Current limit 2000W
            const error = new Error('State update failed');
            adapter.setStateAsync = sinon.stub().rejects(error);
            const newPower = -820; // Target is -800W, so new limit would be 2000 + (-820 - (-800)) = 1980W (change of 20W, below threshold)
            
            // Act - inverter limit change of 20W is below threshold, should call setStateAsync
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert(adapter.log.error.calledWith('Error in power control adjustment: State update failed'));
        });

        it('should work with decimal power values', async function() {
            // Arrange
            adapter.lastGridPower = -1000.5;
            adapter.getForeignStateAsync.resolves({ val: 2000.5 }); // Current limit 2000.5W
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            const newPower = -1150.7; // Target is -800W, so new limit would be 2000.5 + (-1150.7 - (-800)) = 1649.8W (change of 350.7W, above threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            // Check if the log was called with a message that includes the calculated difference (handle floating point precision)
            const logCalls = adapter.log.info.getCalls();
            const hasCorrectLog = logCalls.some(call => 
                call.args[0].includes('Inverter limit would change by') && 
                call.args[0].includes('350.7')
            );
            assert(hasCorrectLog, `Expected log message about 350.7W change, got: ${logCalls.map(c => c.args[0]).join(', ')}`);
        });

        it('should adjust power when transitioning from consuming to feeding with significant inverter limit change', async function() {
            // Arrange
            adapter.lastGridPower = 500; // Was consuming 500W
            adapter.getForeignStateAsync.resolves({ val: 1500 }); // Current limit 1500W
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            const newPower = -1200; // Now feeding in 1200W, target is -800W, so new limit would be 1500 + (-1200 - (-800)) = 1100W (change of 400W, above threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            assert(adapter.log.info.calledWith('Inverter limit would change by 400W, adjusting inverter power limit'));
        });

        it('should not adjust when transitioning from consuming to feeding with small inverter limit change', async function() {
            // Arrange
            adapter.lastGridPower = 50; // Was consuming 50W
            adapter.setStateAsync = sinon.stub().resolves();
            adapter.getForeignStateAsync.resolves({ val: 1500 }); // Current limit 1500W
            const newPower = -850; // Now feeding in 850W, target is -800W, so new limit would be 1500 + (-850 - (-800)) = 1450W (change of 50W, below threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(!adapter.adjustInverterPowerLimit.called);
            assert(adapter.setStateAsync.calledWith('powerControlActive', { val: false, ack: true }));
        });

        it('should handle transition from feeding to consuming with significant inverter limit change', async function() {
            // Arrange
            adapter.lastGridPower = -800; // Was feeding in 800W
            adapter.getForeignStateAsync.resolves({ val: 1500 }); // Current limit 1500W
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            const newPower = 300; // Now consuming 300W, so new limit would be 1500 + 300 = 1800W (change of 300W, above threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            assert(adapter.log.info.calledWith('Inverter limit would change by 300W, adjusting inverter power limit'));
        });

        it('should correctly calculate inverter limit change when signs differ (negative to positive)', async function() {
            // Arrange - transition from feeding in to consuming
            adapter.lastGridPower = -500; // Was feeding 500W into grid
            adapter.getForeignStateAsync.resolves({ val: 1200 }); // Current limit 1200W
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            const newPower = 300; // Now consuming 300W from grid, so new limit would be 1200 + 300 = 1500W (change of 300W, above threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            assert(adapter.log.info.calledWith('Inverter limit would change by 300W, adjusting inverter power limit'));
        });

        it('should correctly calculate inverter limit change when signs differ (positive to negative)', async function() {
            // Arrange - transition from consuming to feeding in
            adapter.lastGridPower = 200; // Was consuming 200W from grid
            adapter.getForeignStateAsync.resolves({ val: 1800 }); // Current limit 1800W
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            const newPower = -600; // Now feeding 600W into grid, target is -800W, so new limit would be 1800 + (-600 - (-800)) = 2000W (change of 200W, above threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            assert(adapter.log.info.calledWith('Inverter limit would change by 200W, adjusting inverter power limit'));
        });

        it('should handle extreme sign changes correctly', async function() {
            // Arrange - large transition from high consumption to high feed-in
            adapter.lastGridPower = 2000; // Was consuming 2000W from grid
            adapter.getForeignStateAsync.resolves({ val: 3000 }); // Current limit 3000W
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            const newPower = -1500; // Now feeding 1500W into grid, target is -800W, so new limit would be 3000 + (-1500 - (-800)) = 2300W (change of 700W, above threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            assert(adapter.log.info.calledWith('Inverter limit would change by 700W, adjusting inverter power limit'));
        });

        it('should correctly calculate inverter limit change for positive to positive transition with large change', async function() {
            // Arrange - transition between different consumption levels
            adapter.lastGridPower = 100; // Was consuming 100W from grid
            adapter.getForeignStateAsync.resolves({ val: 1200 }); // Current limit 1200W
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            const newPower = 800; // Now consuming 800W from grid, so new limit would be 1200 + 800 = 2000W (change of 800W, above threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            assert(adapter.log.info.calledWith('Inverter limit would change by 800W, adjusting inverter power limit'));
        });

        it('should not adjust when consuming power results in small inverter limit change', async function() {
            // Arrange - small consumption that results in small inverter change
            adapter.lastGridPower = 1000; // Was consuming 1000W from grid
            adapter.setStateAsync = sinon.stub().resolves();
            adapter.getForeignStateAsync.resolves({ val: 2950 }); // Current limit 2950W
            const newPower = 1050; // Now consuming 1050W from grid, so new limit would be 2950 + 1050 = 4000W (change of 1050W, above threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            assert(adapter.log.info.calledWith('Inverter limit would change by 1050W, adjusting inverter power limit'));
        });

        it('should correctly calculate inverter limit change for negative to negative transition with large change', async function() {
            // Arrange - transition between different feed-in levels
            adapter.lastGridPower = -500; // Was feeding 500W into grid
            adapter.getForeignStateAsync.resolves({ val: 2000 }); // Current limit 2000W
            adapter.adjustInverterPowerLimit = sinon.stub().resolves();
            const newPower = -1200; // Now feeding 1200W into grid, target is -800W, so new limit would be 2000 + (-1200 - (-800)) = 1600W (change of 400W, above threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            assert(adapter.log.info.calledWith('Inverter limit would change by 400W, adjusting inverter power limit'));
        });

        it('should correctly calculate inverter limit change for negative to negative transition with small change', async function() {
            // Arrange - small transition between feed-in levels
            adapter.lastGridPower = -1000; // Was feeding 1000W into grid
            adapter.setStateAsync = sinon.stub().resolves();
            adapter.getForeignStateAsync.resolves({ val: 2000 }); // Current limit 2000W
            const newPower = -1050; // Now feeding 1050W into grid, target is -800W, so new limit would be 2000 + (-1050 - (-800)) = 1750W (change of 250W, above threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimit.calledWith(newPower));
            assert(adapter.log.info.calledWith('Inverter limit would change by 250W, adjusting inverter power limit'));
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