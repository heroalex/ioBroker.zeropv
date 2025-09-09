const assert = require('assert');
const sinon = require('sinon');
const ObjectFilter = require('../../lib/object-filter');

describe('ObjectFilter', function() {
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

    describe('isRelevantPowerSource()', function() {
        
        it('should exclude OpenDTU power states', function() {
            // Arrange
            const id = 'opendtu.0.123456789.ac.phase_1.power';
            const objData = {
                common: { name: 'AC Power Phase 1' }
            };

            // Act
            const result = ObjectFilter.isRelevantPowerSource(id, objData);

            // Assert
            assert.strictEqual(result, false);
        });

        it('should exclude individual phase power measurements', function() {
            // Arrange
            const testCases = [
                'shelly.0.device.ac.phase_1.power',
                'sensor.0.input_2.power',
                'meter.0.ApparentPowerA',
                'meter.0.ReactivePowerB',
                'meter.0.ActivePowerC',
                'inverter.0.power_dc'
            ];

            for (const id of testCases) {
                const objData = { common: { name: 'Phase Power' } };
                
                // Act
                const result = ObjectFilter.isRelevantPowerSource(id, objData);

                // Assert
                assert.strictEqual(result, false, `Should exclude ${id}`);
            }
        });

        it('should include total power measurements by pattern', function() {
            // Arrange
            const testCases = [
                'shelly.0.TotalActivePower',
                'meter.0.TotalApparentPower',
                'sensor.0.device.total.power',
                'adapter.0.gridPower',
                'meter.0.totalPower',
                'inverter.0.activePower'
            ];

            for (const id of testCases) {
                const objData = { common: { name: 'Total Power' } };
                
                // Act
                const result = ObjectFilter.isRelevantPowerSource(id, objData);

                // Assert
                assert.strictEqual(result, true, `Should include ${id}`);
            }
        });

        it('should include power states with relevant names', function() {
            // Arrange
            const testCases = [
                { id: 'meter.0.power', name: 'Total Grid Power' },
                { id: 'sensor.0.power', name: 'Main Power Consumption' },
                { id: 'device.0.power', name: 'Grid Total Power' }
            ];

            for (const testCase of testCases) {
                const objData = { common: { name: testCase.name } };
                
                // Act
                const result = ObjectFilter.isRelevantPowerSource(testCase.id, objData);

                // Assert
                assert.strictEqual(result, true, `Should include ${testCase.id} with name "${testCase.name}"`);
            }
        });

        it('should exclude power states with phase/input names', function() {
            // Arrange
            const testCases = [
                { id: 'meter.0.power', name: 'Phase 1 Power' },
                { id: 'sensor.0.power', name: 'Input Channel Power' },
                { id: 'device.0.power', name: 'Total Phase Power' }
            ];

            for (const testCase of testCases) {
                const objData = { common: { name: testCase.name } };
                
                // Act
                const result = ObjectFilter.isRelevantPowerSource(testCase.id, objData);

                // Assert
                assert.strictEqual(result, false, `Should exclude ${testCase.id} with name "${testCase.name}"`);
            }
        });

        it('should handle non-string names gracefully', function() {
            // Arrange
            const objData = { common: { name: { en: 'Total Power', de: 'Gesamtleistung' } } };

            // Act
            const result = ObjectFilter.isRelevantPowerSource('meter.0.power', objData);

            // Assert
            assert.strictEqual(result, false); // Should not throw and default to false for object names
        });
    });

    describe('filterObjects()', function() {
        
        it('should filter power source objects correctly', function() {
            // Arrange
            const allObjects = {
                'shelly.0.TotalActivePower': {
                    type: 'state',
                    common: { name: 'Total Active Power', role: 'value.power' }
                },
                'opendtu.0.123456789.power': {
                    type: 'state', 
                    common: { name: 'Inverter Power', role: 'value.power' }
                },
                'meter.0.phase1.power': {
                    type: 'state',
                    common: { name: 'Phase 1 Power', role: 'value.power' }
                }
            };
            const filter = { type: 'state', role: 'value.power' };

            // Act
            const result = ObjectFilter.filterObjects(allObjects, filter, logger);

            // Assert
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0]._id, 'shelly.0.TotalActivePower');
            assert.strictEqual(result[0].label, 'Total Active Power');
        });

        it('should filter OpenDTU device objects correctly', function() {
            // Arrange
            const allObjects = {
                'opendtu.0.123456789': {
                    type: 'device',
                    common: { name: 'Inverter 1' }
                },
                'opendtu.0.987654321': {
                    type: 'device', 
                    common: { name: 'Inverter 2' }
                },
                'opendtu.0': {
                    type: 'instance',
                    common: { name: 'OpenDTU Adapter' }
                }
            };
            const filter = { type: 'device', name: '*opendtu*' };

            // Act
            const result = ObjectFilter.filterObjects(allObjects, filter, logger);

            // Assert
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0]._id, 'opendtu.0.123456789');
            assert.strictEqual(result[1]._id, 'opendtu.0.987654321');
        });

        it('should handle objects with complex names', function() {
            // Arrange
            const allObjects = {
                'device.0.totalPower': {
                    type: 'state',
                    common: { 
                        name: { en: 'Total Power', de: 'Gesamtleistung' },
                        role: 'value.power'
                    }
                },
                'device.1.totalPower': {
                    type: 'state',
                    common: { 
                        name: '[object Object]',
                        role: 'value.power'
                    }
                }
            };
            const filter = { type: 'state', role: 'value.power' };

            // Act
            const result = ObjectFilter.filterObjects(allObjects, filter, logger);

            // Assert
            assert.strictEqual(result.length, 2);
            // Results are sorted by display name - 'device.1.totalPower' comes before 'Total Power'
            assert.strictEqual(result[0].label, 'device.1.totalPower'); // Should fallback to ID
            assert.strictEqual(result[1].label, 'Total Power'); // Should use English name
        });

        it('should sort results by display name', function() {
            // Arrange
            const allObjects = {
                'meter.0.zebra': {
                    type: 'state',
                    common: { name: 'Zebra Total Power', role: 'value.power' }
                },
                'meter.0.alpha': {
                    type: 'state',
                    common: { name: 'Alpha Total Power', role: 'value.power' }
                }
            };
            const filter = { type: 'state', role: 'value.power' };

            // Act
            const result = ObjectFilter.filterObjects(allObjects, filter, logger);

            // Assert
            assert.strictEqual(result.length, 2);
            assert.strictEqual(result[0].label, 'Alpha Total Power'); // Should be first alphabetically
            assert.strictEqual(result[1].label, 'Zebra Total Power');
        });

        it('should handle empty objects gracefully', function() {
            // Arrange
            const allObjects = {};
            const filter = { type: 'state', role: 'value.power' };

            // Act
            const result = ObjectFilter.filterObjects(allObjects, filter, logger);

            // Assert
            assert.strictEqual(result.length, 0);
        });

        it('should skip objects with missing common property', function() {
            // Arrange
            const allObjects = {
                'device.0.power': {
                    type: 'state'
                    // Missing common property
                },
                'device.1.power': {
                    type: 'state',
                    common: { name: 'Total Power', role: 'value.power' }
                }
            };
            const filter = { type: 'state', role: 'value.power' };

            // Act
            const result = ObjectFilter.filterObjects(allObjects, filter, logger);

            // Assert
            assert.strictEqual(result.length, 1);
            assert.strictEqual(result[0]._id, 'device.1.power');
        });
    });
});