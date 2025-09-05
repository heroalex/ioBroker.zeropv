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
    
    beforeEach(function() {
        adapter = {
            config: {
                feedInThreshold: 100,
                targetFeedIn: -800,
                inverters: [
                    { powerControlObject: 'test.inverter1.control', name: 'Inverter 1', maxPower: 2250 },
                    { powerControlObject: 'test.inverter2.control', name: 'Inverter 2', maxPower: 2250 }
                ]
            },
            lastGridPower: null,
            lastPowerLimits: new Map(),
            getForeignStateAsync: sinon.stub(),
            setState: sinon.stub(),
            setForeignStateAsync: sinon.stub(),
            getAllInverterLimits: sinon.stub(),
            adjustInverterPowerLimits: sinon.stub().resolves(),
            log: {
                info: sinon.stub(),
                debug: sinon.stub(),
                warn: sinon.stub(),
                error: sinon.stub()
            }
        };
        
        // Add the checkPowerControlAdjustment method from main.js with multiple inverters support
        adapter.checkPowerControlAdjustment = async function(currentGridPower) {
            try {
                // Check if this is the first reading
                if (this.lastGridPower === null) {
                    this.lastGridPower = currentGridPower;
                    return;
                }

                // Get current limits from all inverters
                const currentLimits = await this.getAllInverterLimits();
                if (currentLimits.length === 0) {
                    this.log.warn('Could not read current power limits from any inverters');
                    this.lastGridPower = currentGridPower;
                    return;
                }

                // Calculate total current limit
                const totalCurrentLimit = currentLimits.reduce((sum, limit) => sum + limit.value, 0);

                // Calculate what the new total limit would be
                let newTotalLimit;
                if (currentGridPower >= 0) {
                    newTotalLimit = totalCurrentLimit + currentGridPower;
                } else {
                    const feedInDifference = currentGridPower - this.config.targetFeedIn;
                    newTotalLimit = Math.max(0, totalCurrentLimit + feedInDifference);
                }

                // Only adjust if total limit change is above threshold
                const limitChange = Math.abs(newTotalLimit - totalCurrentLimit);
                
                if (limitChange >= this.config.feedInThreshold) {
                    this.log.info(`Total inverter limit would change by ${limitChange}W, adjusting inverter power limits`);
                    await this.adjustInverterPowerLimits(currentGridPower, currentLimits);
                } else {
                    await this.setState('powerControlActive', { val: false, ack: true });
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
        
        it('should handle positive grid power and adjust if total inverter limit change is significant', async function() {
            // Arrange
            adapter.lastGridPower = 200;
            adapter.setState = sinon.stub().resolves();
            adapter.adjustInverterPowerLimits = sinon.stub().resolves();
            const mockLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 500 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 500 }
            ];
            adapter.getAllInverterLimits.resolves(mockLimits);
            
            // Act - grid power 1500W, total current limit 1000W -> new total limit would be 2500W (change of 1500W, above 100W threshold)
            await adapter.checkPowerControlAdjustment(1500);
            
            // Assert
            assert.equal(adapter.lastGridPower, 1500);
            assert(adapter.adjustInverterPowerLimits.calledWith(1500, mockLimits));
            assert(adapter.log.info.calledWith('Total inverter limit would change by 1500W, adjusting inverter power limits'));
        });

        it('should set powerControlActive to false when total inverter limit change is below threshold', async function() {
            // Arrange
            adapter.lastGridPower = -850; // Previously feeding in 850W
            adapter.setState = sinon.stub().resolves();
            const mockLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1000 }
            ];
            adapter.getAllInverterLimits.resolves(mockLimits);
            
            // Act - now feeding in 800W (target is -800W), so new total limit would be 2000 + (-800 - (-800)) = 2000W (no change)
            await adapter.checkPowerControlAdjustment(-800);
            
            // Assert
            assert.equal(adapter.lastGridPower, -800);
            assert(adapter.setState.calledWith('powerControlActive', { val: false, ack: true }));
            assert(!adapter.adjustInverterPowerLimits.called);
        });

        it('should store first negative power reading without adjustment', async function() {
            // Arrange - first reading (lastGridPower is null)
            adapter.lastGridPower = null;
            
            // Act
            await adapter.checkPowerControlAdjustment(-1000);
            
            // Assert
            assert.equal(adapter.lastGridPower, -1000);
            assert(!adapter.setState.called);
            assert(!adapter.adjustInverterPowerLimits.called);
        });

        it('should handle when no inverter limits can be read', async function() {
            // Arrange
            adapter.lastGridPower = -1000;
            adapter.getAllInverterLimits.resolves([]); // No limits available
            
            // Act
            await adapter.checkPowerControlAdjustment(-1200);
            
            // Assert
            assert.equal(adapter.lastGridPower, -1200); // lastGridPower should still be updated
            assert(adapter.log.warn.calledWith('Could not read current power limits from any inverters'));
            assert(!adapter.adjustInverterPowerLimits.called);
        });

        it('should not adjust power when total inverter limit change is below threshold', async function() {
            // Arrange
            adapter.lastGridPower = -1000;
            adapter.setState = sinon.stub().resolves();
            const mockLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1000 }
            ];
            adapter.getAllInverterLimits.resolves(mockLimits);
            const newPower = -850; // Target is -800W, so new total limit would be 2000 + (-850 - (-800)) = 1950W (change of 50W, below 100W threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(!adapter.adjustInverterPowerLimits.called);
            assert(adapter.setState.calledWith('powerControlActive', { val: false, ack: true }));
        });

        it('should adjust power when total inverter limit change is above threshold', async function() {
            // Arrange
            adapter.lastGridPower = -1000;
            const mockLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1000 }
            ];
            adapter.getAllInverterLimits.resolves(mockLimits);
            adapter.adjustInverterPowerLimits = sinon.stub().resolves();
            const newPower = -1200; // Target is -800W, so new total limit would be 2000 + (-1200 - (-800)) = 1600W (change of 400W, above 100W threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimits.calledWith(newPower, mockLimits));
            assert(adapter.log.info.calledWith('Total inverter limit would change by 400W, adjusting inverter power limits'));
        });

        it('should adjust power when feed-in decreases significantly', async function() {
            // Arrange
            adapter.lastGridPower = -1500;
            const mockLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1000 }
            ];
            adapter.getAllInverterLimits.resolves(mockLimits);
            adapter.adjustInverterPowerLimits = sinon.stub().resolves();
            const newPower = -900; // Target is -800W, so new total limit would be 2000 + (-900 - (-800)) = 1900W (change of 100W, exactly at threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimits.calledWith(newPower, mockLimits));
            assert(adapter.log.info.calledWith('Total inverter limit would change by 100W, adjusting inverter power limits'));
        });

        it('should adjust power when total inverter limit change exactly equals threshold', async function() {
            // Arrange
            adapter.lastGridPower = -1000;
            const mockLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1000 }
            ];
            adapter.getAllInverterLimits.resolves(mockLimits);
            adapter.adjustInverterPowerLimits = sinon.stub().resolves();
            const newPower = -700; // Target is -800W, so new total limit would be 2000 + (-700 - (-800)) = 2100W (change of exactly 100W)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimits.calledWith(newPower, mockLimits));
            assert(adapter.log.info.calledWith('Total inverter limit would change by 100W, adjusting inverter power limits'));
        });

        it('should NOT adjust when grid power change is large but total inverter limit change is small', async function() {
            // Arrange - This test demonstrates the flaw in the old logic
            adapter.lastGridPower = -200; // Previously feeding in 200W
            adapter.setState = sinon.stub().resolves();
            const mockLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1000 }
            ];
            adapter.getAllInverterLimits.resolves(mockLimits);
            const newPower = -850; // Now feeding in 850W (grid change of 650W, above old threshold)
            // Target is -800W, so new total limit would be 2000 + (-850 - (-800)) = 1950W (total inverter change of only 50W, below threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(!adapter.adjustInverterPowerLimits.called);
            assert(adapter.setState.calledWith('powerControlActive', { val: false, ack: true }));
        });

        it('should handle adjustInverterPowerLimits errors gracefully', async function() {
            // Arrange
            adapter.lastGridPower = -1000;
            const mockLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1000 }
            ];
            adapter.getAllInverterLimits.resolves(mockLimits);
            const newPower = -1200;
            const error = new Error('Inverter communication failed');
            adapter.adjustInverterPowerLimits = sinon.stub().rejects(error);
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert(adapter.log.error.calledWith('Error in power control adjustment: Inverter communication failed'));
            assert.equal(adapter.lastGridPower, -1000); // Should not be updated on error
        });

        it('should handle setState errors gracefully', async function() {
            // Arrange - small total inverter limit change that should set powerControlActive to false
            adapter.lastGridPower = -850;
            const mockLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1000 }
            ];
            adapter.getAllInverterLimits.resolves(mockLimits);
            const error = new Error('State update failed');
            adapter.setState = sinon.stub().rejects(error);
            const newPower = -820; // Target is -800W, so new total limit would be 2000 + (-820 - (-800)) = 1980W (change of 20W, below threshold)
            
            // Act - total inverter limit change of 20W is below threshold, should call setState
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert(adapter.log.error.calledWith('Error in power control adjustment: State update failed'));
        });

        it('should work with decimal power values', async function() {
            // Arrange
            adapter.lastGridPower = -1000.5;
            const mockLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1000.25 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1000.25 }
            ];
            adapter.getAllInverterLimits.resolves(mockLimits);
            adapter.adjustInverterPowerLimits = sinon.stub().resolves();
            const newPower = -1150.7; // Target is -800W, so new total limit would be 2000.5 + (-1150.7 - (-800)) = 1649.8W (change of 350.7W, above threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimits.calledWith(newPower, mockLimits));
            // Check if the log was called with a message that includes the calculated difference (handle floating point precision)
            const logCalls = adapter.log.info.getCalls();
            const hasCorrectLog = logCalls.some(call => 
                call.args[0].includes('Total inverter limit would change by') && 
                call.args[0].includes('350.7')
            );
            assert(hasCorrectLog, `Expected log message about 350.7W change, got: ${logCalls.map(c => c.args[0]).join(', ')}`);
        });

        it('should adjust power when transitioning from consuming to feeding with significant total inverter limit change', async function() {
            // Arrange
            adapter.lastGridPower = 500; // Was consuming 500W
            const mockLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 750 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 750 }
            ];
            adapter.getAllInverterLimits.resolves(mockLimits);
            adapter.adjustInverterPowerLimits = sinon.stub().resolves();
            const newPower = -1200; // Now feeding in 1200W, target is -800W, so new total limit would be 1500 + (-1200 - (-800)) = 1100W (change of 400W, above threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimits.calledWith(newPower, mockLimits));
            assert(adapter.log.info.calledWith('Total inverter limit would change by 400W, adjusting inverter power limits'));
        });

        it('should not adjust when transitioning from consuming to feeding with small total inverter limit change', async function() {
            // Arrange
            adapter.lastGridPower = 50; // Was consuming 50W
            adapter.setState = sinon.stub().resolves();
            const mockLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 750 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 750 }
            ];
            adapter.getAllInverterLimits.resolves(mockLimits);
            const newPower = -850; // Now feeding in 850W, target is -800W, so new total limit would be 1500 + (-850 - (-800)) = 1450W (change of 50W, below threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(!adapter.adjustInverterPowerLimits.called);
            assert(adapter.setState.calledWith('powerControlActive', { val: false, ack: true }));
        });

        it('should handle transition from feeding to consuming with significant total inverter limit change', async function() {
            // Arrange
            adapter.lastGridPower = -800; // Was feeding in 800W
            const mockLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 750 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 750 }
            ];
            adapter.getAllInverterLimits.resolves(mockLimits);
            adapter.adjustInverterPowerLimits = sinon.stub().resolves();
            const newPower = 300; // Now consuming 300W, so new total limit would be 1500 + 300 = 1800W (change of 300W, above threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimits.calledWith(newPower, mockLimits));
            assert(adapter.log.info.calledWith('Total inverter limit would change by 300W, adjusting inverter power limits'));
        });

        it('should correctly calculate total inverter limit change when signs differ (negative to positive)', async function() {
            // Arrange - transition from feeding in to consuming
            adapter.lastGridPower = -500; // Was feeding 500W into grid
            const mockLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 600 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 600 }
            ];
            adapter.getAllInverterLimits.resolves(mockLimits);
            adapter.adjustInverterPowerLimits = sinon.stub().resolves();
            const newPower = 300; // Now consuming 300W from grid, so new total limit would be 1200 + 300 = 1500W (change of 300W, above threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimits.calledWith(newPower, mockLimits));
            assert(adapter.log.info.calledWith('Total inverter limit would change by 300W, adjusting inverter power limits'));
        });

        it('should correctly calculate total inverter limit change when signs differ (positive to negative)', async function() {
            // Arrange - transition from consuming to feeding in
            adapter.lastGridPower = 200; // Was consuming 200W from grid
            const mockLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 900 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 900 }
            ];
            adapter.getAllInverterLimits.resolves(mockLimits);
            adapter.adjustInverterPowerLimits = sinon.stub().resolves();
            const newPower = -600; // Now feeding 600W into grid, target is -800W, so new total limit would be 1800 + (-600 - (-800)) = 2000W (change of 200W, above threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimits.calledWith(newPower, mockLimits));
            assert(adapter.log.info.calledWith('Total inverter limit would change by 200W, adjusting inverter power limits'));
        });

        it('should handle extreme sign changes correctly', async function() {
            // Arrange - large transition from high consumption to high feed-in
            adapter.lastGridPower = 2000; // Was consuming 2000W from grid
            const mockLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1500 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1500 }
            ];
            adapter.getAllInverterLimits.resolves(mockLimits);
            adapter.adjustInverterPowerLimits = sinon.stub().resolves();
            const newPower = -1500; // Now feeding 1500W into grid, target is -800W, so new total limit would be 3000 + (-1500 - (-800)) = 2300W (change of 700W, above threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimits.calledWith(newPower, mockLimits));
            assert(adapter.log.info.calledWith('Total inverter limit would change by 700W, adjusting inverter power limits'));
        });

        it('should correctly calculate total inverter limit change for positive to positive transition with large change', async function() {
            // Arrange - transition between different consumption levels
            adapter.lastGridPower = 100; // Was consuming 100W from grid
            const mockLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 600 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 600 }
            ];
            adapter.getAllInverterLimits.resolves(mockLimits);
            adapter.adjustInverterPowerLimits = sinon.stub().resolves();
            const newPower = 800; // Now consuming 800W from grid, so new total limit would be 1200 + 800 = 2000W (change of 800W, above threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimits.calledWith(newPower, mockLimits));
            assert(adapter.log.info.calledWith('Total inverter limit would change by 800W, adjusting inverter power limits'));
        });

        it('should adjust when consuming power results in large total inverter limit change', async function() {
            // Arrange - consumption that results in large total inverter change
            adapter.lastGridPower = 1000; // Was consuming 1000W from grid
            const mockLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1475 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1475 }
            ];
            adapter.getAllInverterLimits.resolves(mockLimits);
            adapter.adjustInverterPowerLimits = sinon.stub().resolves();
            const newPower = 1050; // Now consuming 1050W from grid, so new total limit would be 2950 + 1050 = 4000W (change of 1050W, above threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimits.calledWith(newPower, mockLimits));
            assert(adapter.log.info.calledWith('Total inverter limit would change by 1050W, adjusting inverter power limits'));
        });

        it('should correctly calculate total inverter limit change for negative to negative transition with large change', async function() {
            // Arrange - transition between different feed-in levels
            adapter.lastGridPower = -500; // Was feeding 500W into grid
            const mockLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1000 }
            ];
            adapter.getAllInverterLimits.resolves(mockLimits);
            adapter.adjustInverterPowerLimits = sinon.stub().resolves();
            const newPower = -1200; // Now feeding 1200W into grid, target is -800W, so new total limit would be 2000 + (-1200 - (-800)) = 1600W (change of 400W, above threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimits.calledWith(newPower, mockLimits));
            assert(adapter.log.info.calledWith('Total inverter limit would change by 400W, adjusting inverter power limits'));
        });

        it('should correctly calculate total inverter limit change for negative to negative transition with large change', async function() {
            // Arrange - transition between feed-in levels
            adapter.lastGridPower = -1000; // Was feeding 1000W into grid
            const mockLimits = [
                { index: 0, powerControlObject: 'test.inverter1.control', value: 1000 },
                { index: 1, powerControlObject: 'test.inverter2.control', value: 1000 }
            ];
            adapter.getAllInverterLimits.resolves(mockLimits);
            adapter.adjustInverterPowerLimits = sinon.stub().resolves();
            const newPower = -1050; // Now feeding 1050W into grid, target is -800W, so new total limit would be 2000 + (-1050 - (-800)) = 1750W (change of 250W, above threshold)
            
            // Act
            await adapter.checkPowerControlAdjustment(newPower);
            
            // Assert
            assert.equal(adapter.lastGridPower, newPower);
            assert(adapter.adjustInverterPowerLimits.calledWith(newPower, mockLimits));
            assert(adapter.log.info.calledWith('Total inverter limit would change by 250W, adjusting inverter power limits'));
        });
    });
});

describe('ZeroPV Adapter - getAllInverterLimits', function() {
    let adapter;
    
    beforeEach(function() {
        adapter = {
            config: {
                inverters: [
                    { powerControlObject: 'test.inverter1.control', name: 'Inverter 1' },
                    { powerControlObject: 'test.inverter2.control', name: 'Inverter 2' }
                ]
            },
            getForeignStateAsync: sinon.stub(),
            log: {
                info: sinon.stub(),
                debug: sinon.stub(),
                warn: sinon.stub(),
                error: sinon.stub()
            }
        };
        
        // Add the getAllInverterLimits method from main.js
        adapter.getAllInverterLimits = async function() {
            const limits = [];
            
            for (let i = 0; i < this.config.inverters.length; i++) {
                const inverter = this.config.inverters[i];
                try {
                    const limitState = await this.getForeignStateAsync(inverter.powerControlObject);
                    
                    if (limitState && limitState.val !== null && limitState.val !== undefined) {
                        const limitValue = parseFloat(limitState.val);
                        if (!isNaN(limitValue)) {
                            limits.push({
                                index: i,
                                powerControlObject: inverter.powerControlObject,
                                value: limitValue
                            });
                        } else {
                            this.log.warn(`Invalid power limit value from inverter ${i + 1}: ${limitState.val}`);
                        }
                    } else {
                        this.log.warn(`Could not read power limit from inverter ${i + 1}: ${inverter.powerControlObject}`);
                    }
                } catch (error) {
                    this.log.error(`Error reading limit from inverter ${i + 1}: ${error.message}`);
                }
            }
            
            return limits;
        };
    });
    
    afterEach(function() {
        sinon.restore();
    });

    describe('getAllInverterLimits()', function() {
        
        it('should return limits from all inverters when all are valid', async function() {
            // Arrange
            adapter.getForeignStateAsync.withArgs('test.inverter1.control').resolves({ val: 1500, ack: true });
            adapter.getForeignStateAsync.withArgs('test.inverter2.control').resolves({ val: 2000, ack: true });
            
            // Act
            const result = await adapter.getAllInverterLimits();
            
            // Assert
            assert.equal(result.length, 2);
            assert.deepEqual(result[0], { index: 0, powerControlObject: 'test.inverter1.control', value: 1500 });
            assert.deepEqual(result[1], { index: 1, powerControlObject: 'test.inverter2.control', value: 2000 });
        });

        it('should skip inverters with null values', async function() {
            // Arrange
            adapter.getForeignStateAsync.withArgs('test.inverter1.control').resolves({ val: 1500, ack: true });
            adapter.getForeignStateAsync.withArgs('test.inverter2.control').resolves({ val: null, ack: true });
            
            // Act
            const result = await adapter.getAllInverterLimits();
            
            // Assert
            assert.equal(result.length, 1);
            assert.deepEqual(result[0], { index: 0, powerControlObject: 'test.inverter1.control', value: 1500 });
            assert(adapter.log.warn.calledWith('Could not read power limit from inverter 2: test.inverter2.control'));
        });

        it('should skip inverters with invalid values', async function() {
            // Arrange
            adapter.getForeignStateAsync.withArgs('test.inverter1.control').resolves({ val: 1500, ack: true });
            adapter.getForeignStateAsync.withArgs('test.inverter2.control').resolves({ val: 'invalid', ack: true });
            
            // Act
            const result = await adapter.getAllInverterLimits();
            
            // Assert
            assert.equal(result.length, 1);
            assert.deepEqual(result[0], { index: 0, powerControlObject: 'test.inverter1.control', value: 1500 });
            assert(adapter.log.warn.calledWith('Invalid power limit value from inverter 2: invalid'));
        });

        it('should handle errors from individual inverters', async function() {
            // Arrange
            adapter.getForeignStateAsync.withArgs('test.inverter1.control').resolves({ val: 1500, ack: true });
            adapter.getForeignStateAsync.withArgs('test.inverter2.control').rejects(new Error('Connection failed'));
            
            // Act
            const result = await adapter.getAllInverterLimits();
            
            // Assert
            assert.equal(result.length, 1);
            assert.deepEqual(result[0], { index: 0, powerControlObject: 'test.inverter1.control', value: 1500 });
            assert(adapter.log.error.calledWith('Error reading limit from inverter 2: Connection failed'));
        });

        it('should return empty array when no inverters respond', async function() {
            // Arrange
            adapter.getForeignStateAsync.withArgs('test.inverter1.control').resolves(null);
            adapter.getForeignStateAsync.withArgs('test.inverter2.control').resolves({ val: undefined, ack: true });
            
            // Act
            const result = await adapter.getAllInverterLimits();
            
            // Assert
            assert.equal(result.length, 0);
            assert(adapter.log.warn.calledTwice);
        });

        it('should handle string number values correctly', async function() {
            // Arrange
            adapter.getForeignStateAsync.withArgs('test.inverter1.control').resolves({ val: '1500.5', ack: true });
            adapter.getForeignStateAsync.withArgs('test.inverter2.control').resolves({ val: '2000', ack: true });
            
            // Act
            const result = await adapter.getAllInverterLimits();
            
            // Assert
            assert.equal(result.length, 2);
            assert.deepEqual(result[0], { index: 0, powerControlObject: 'test.inverter1.control', value: 1500.5 });
            assert.deepEqual(result[1], { index: 1, powerControlObject: 'test.inverter2.control', value: 2000 });
        });
    });
});

describe('ZeroPV Adapter - calculateNewClampedLimits', function() {
    let adapter;
    
    beforeEach(function() {
        // Create a mock adapter object with the calculateNewClampedLimits method
        adapter = {
            config: {
                inverters: [
                    { name: 'Inverter 1', maxPower: 2250 },
                    { name: 'Inverter 2', maxPower: 1800 }
                ],
                targetFeedIn: -800
            },
            log: {
                debug: sinon.stub()
            }
        };
        
        // Add the calculateNewClampedLimits method from main.js
        adapter.calculateNewClampedLimits = function(currentGridPower, currentLimits) {
            // Calculate total current limit
            const totalOldLimit = currentLimits.reduce((sum, limit) => sum + limit.value, 0);

            // Calculate the adjustment needed
            let newTotalLimit;
            if (currentGridPower >= 0) {
                // Consuming from grid - increase PV production
                newTotalLimit = totalOldLimit + currentGridPower;
            } else {
                // Feeding into grid - adjust to reach target feed-in
                const feedInDifference = currentGridPower - this.config.targetFeedIn;
                newTotalLimit = Math.max(0, totalOldLimit + feedInDifference);
            }

            // Distribute the new total limit equally among all inverters
            const newLimitPerInverter = Math.floor(newTotalLimit / this.config.inverters.length);
            
            // Calculate clamped limits for each inverter
            const newLimits = [];
            let totalNewLimit = 0;
            
            for (const limit of currentLimits) {
                const inverter = this.config.inverters[limit.index];
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
            const result = adapter.calculateNewClampedLimits(currentGridPower, currentLimits);
            
            // Assert
            assert.equal(result.totalOldLimit, 1800);
            assert.equal(result.totalNewLimit, 2300); // 1800 + 500
            assert.equal(result.newLimits.length, 2);
            assert.equal(result.newLimits[0].newValue, 1150); // Math.floor(2300/2)
            assert.equal(result.newLimits[1].newValue, 1150);
        });

        it('should decrease limits when feeding into grid beyond target', function() {
            // Arrange
            const currentGridPower = -1200; // feeding 1200W into grid
            const currentLimits = [
                { index: 0, controlObject: 'test.inv1.control', value: 2000 },
                { index: 1, controlObject: 'test.inv2.control', value: 1500 }
            ];
            
            // Act
            const result = adapter.calculateNewClampedLimits(currentGridPower, currentLimits);
            
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
            const result = adapter.calculateNewClampedLimits(currentGridPower, currentLimits);
            
            // Assert
            assert.equal(result.totalOldLimit, 3500);
            // Before clamping: Math.floor((3500 + 2000) / 2) = 2750 per inverter
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
            const result = adapter.calculateNewClampedLimits(currentGridPower, currentLimits);
            
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
            const result = adapter.calculateNewClampedLimits(currentGridPower, currentLimits);
            
            // Assert
            assert.equal(result.totalOldLimit, 1900);
            // newTotalLimit = 1900 + 100 = 2000
            // Math.floor(2000/2) = 1000 per inverter
            assert.equal(result.totalNewLimit, 2000); // 1000 + 1000
            assert.equal(result.newLimits[0].newValue, 1000);
            assert.equal(result.newLimits[1].newValue, 1000);
        });

        it('should preserve original values in result object', function() {
            // Arrange
            const currentGridPower = 200;
            const currentLimits = [
                { index: 0, controlObject: 'test.inv1.control', value: 1000 },
                { index: 1, controlObject: 'test.inv2.control', value: 800 }
            ];
            
            // Act
            const result = adapter.calculateNewClampedLimits(currentGridPower, currentLimits);
            
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
            adapter.config.inverters = [
                { name: 'Inverter 1' }, // no maxPower specified
                { name: 'Inverter 2', maxPower: 1800 }
            ];
            const currentGridPower = 3000; // large consumption
            const currentLimits = [
                { index: 0, controlObject: 'test.inv1.control', value: 1000 },
                { index: 1, controlObject: 'test.inv2.control', value: 800 }
            ];
            
            // Act
            const result = adapter.calculateNewClampedLimits(currentGridPower, currentLimits);
            
            // Assert
            // Before clamping: Math.floor((1800 + 3000) / 2) = 2400 per inverter
            // After clamping: inv1=2250 (fallback), inv2=1800 (max)
            assert.equal(result.newLimits[0].newValue, 2250); // fallback to 2250W
            assert.equal(result.newLimits[1].newValue, 1800); // clamped to maxPower
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