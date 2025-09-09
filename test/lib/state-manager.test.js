const assert = require('assert');
const sinon = require('sinon');
const StateManager = require('../../lib/state-manager');

describe('StateManager', function() {
    let adapter;
    let getInverterDisplayName;

    beforeEach(function() {
        adapter = {
            setObjectNotExistsAsync: sinon.stub().resolves()
        };
        
        getInverterDisplayName = sinon.stub();
    });

    afterEach(function() {
        sinon.restore();
    });

    describe('createStatesAsync()', function() {
        
        it('should create all required base states', async function() {
            // Arrange
            const inverters = [];
            
            // Act
            await StateManager.createStatesAsync(adapter, inverters, getInverterDisplayName);

            // Assert
            assert(adapter.setObjectNotExistsAsync.calledWith('gridPower', {
                type: 'state',
                common: {
                    name: 'Grid power (+ = import, - = export)',
                    type: 'number',
                    role: 'value.power',
                    read: true,
                    write: false,
                    unit: 'W'
                },
                native: {}
            }));

            assert(adapter.setObjectNotExistsAsync.calledWith('feedingIn', {
                type: 'state',
                common: {
                    name: 'Feeding into grid',
                    type: 'boolean',
                    role: 'indicator',
                    read: true,
                    write: false,
                    def: false
                },
                native: {}
            }));

            assert(adapter.setObjectNotExistsAsync.calledWith('currentPowerLimit', {
                type: 'state',
                common: {
                    name: 'Current inverter power limit',
                    type: 'number',
                    role: 'value.power',
                    read: true,
                    write: false,
                    unit: 'W'
                },
                native: {}
            }));

            assert(adapter.setObjectNotExistsAsync.calledWith('powerControlActive', {
                type: 'state',
                common: {
                    name: 'Power control is active',
                    type: 'boolean',
                    role: 'indicator',
                    read: true,
                    write: false,
                    def: false
                },
                native: {}
            }));
        });

        it('should create inverter states for each configured inverter', async function() {
            // Arrange
            const inverters = [
                { inverterObject: 'opendtu.0.123456789' },
                { inverterObject: 'opendtu.0.987654321' }
            ];
            
            getInverterDisplayName.onCall(0).resolves('Balcony Inverter');
            getInverterDisplayName.onCall(1).resolves('Roof Inverter');

            // Act
            await StateManager.createStatesAsync(adapter, inverters, getInverterDisplayName);

            // Assert
            assert(getInverterDisplayName.calledWith('opendtu.0.123456789', 0));
            assert(getInverterDisplayName.calledWith('opendtu.0.987654321', 1));

            assert(adapter.setObjectNotExistsAsync.calledWith('inverter0.powerLimit', {
                type: 'state',
                common: {
                    name: 'Balcony Inverter power limit',
                    type: 'number',
                    role: 'value.power',
                    read: true,
                    write: false,
                    unit: 'W'
                },
                native: {}
            }));

            assert(adapter.setObjectNotExistsAsync.calledWith('inverter1.powerLimit', {
                type: 'state',
                common: {
                    name: 'Roof Inverter power limit',
                    type: 'number',
                    role: 'value.power',
                    read: true,
                    write: false,
                    unit: 'W'
                },
                native: {}
            }));
        });

        it('should handle empty inverters array', async function() {
            // Arrange
            const inverters = [];

            // Act
            await StateManager.createStatesAsync(adapter, inverters, getInverterDisplayName);

            // Assert - should only create base states, no inverter states
            assert.strictEqual(adapter.setObjectNotExistsAsync.callCount, 4); // Only base states
            assert.strictEqual(getInverterDisplayName.callCount, 0);
        });

        it('should handle getInverterDisplayName errors gracefully', async function() {
            // Arrange
            const inverters = [
                { inverterObject: 'opendtu.0.123456789' }
            ];
            
            getInverterDisplayName.rejects(new Error('Network error'));

            // Act & Assert - should propagate the error
            try {
                await StateManager.createStatesAsync(adapter, inverters, getInverterDisplayName);
                assert.fail('Should have thrown an error');
            } catch (error) {
                assert.strictEqual(error.message, 'Network error');
            }
        });

        it('should call setObjectNotExistsAsync correct number of times', async function() {
            // Arrange
            const inverters = [
                { inverterObject: 'opendtu.0.123456789' },
                { inverterObject: 'opendtu.0.987654321' },
                { inverterObject: 'opendtu.0.555666777' }
            ];
            
            getInverterDisplayName.resolves('Test Inverter');

            // Act
            await StateManager.createStatesAsync(adapter, inverters, getInverterDisplayName);

            // Assert - 4 base states + 3 inverter states = 7 total calls
            assert.strictEqual(adapter.setObjectNotExistsAsync.callCount, 7);
            assert.strictEqual(getInverterDisplayName.callCount, 3);
        });

        it('should maintain correct state structure for inverter states', async function() {
            // Arrange
            const inverters = [
                { inverterObject: 'opendtu.0.123456789' }
            ];
            
            getInverterDisplayName.resolves('My Custom Inverter Name');

            // Act
            await StateManager.createStatesAsync(adapter, inverters, getInverterDisplayName);

            // Assert - Check the specific call for inverter state
            const inverterStateCall = adapter.setObjectNotExistsAsync.getCalls().find(
                call => call.args[0] === 'inverter0.powerLimit'
            );
            
            assert(inverterStateCall, 'Should have called setObjectNotExistsAsync for inverter0.powerLimit');
            assert.strictEqual(inverterStateCall.args[1].type, 'state');
            assert.strictEqual(inverterStateCall.args[1].common.name, 'My Custom Inverter Name power limit');
            assert.strictEqual(inverterStateCall.args[1].common.type, 'number');
            assert.strictEqual(inverterStateCall.args[1].common.role, 'value.power');
            assert.strictEqual(inverterStateCall.args[1].common.unit, 'W');
            assert.strictEqual(inverterStateCall.args[1].common.read, true);
            assert.strictEqual(inverterStateCall.args[1].common.write, false);
        });
    });
});