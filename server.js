const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static('public'));

// VirtualVilla Core
class VirtualVilla {
    constructor() {
        this.virtualDevices = new Map();
        this.automations = [];
        this.rooms = new Map();
        this.roomTimeouts = new Map(); // 🆕 Track timeouts per room
        this.setupDefaultRooms();
        this.setupAdvancedAutomations();
    }
    
    setupDefaultRooms() {
        // Pre-defined rooms for the "villa"
        const defaultRooms = [
            { id: 'entrance', name: '🏠 Entrance', devices: [] },
            { id: 'living-room', name: '🛋️ Living Room', devices: [] },
            { id: 'kitchen', name: '👨‍🍳 Kitchen', devices: [] },
            { id: 'bedroom', name: '🛏️ Bedroom', devices: [] },
            { id: 'bathroom', name: '🚿 Bathroom', devices: [] }, // 🆕 Added bathroom
            { id: 'office', name: '💼 Office', devices: [] }
        ];
        
        defaultRooms.forEach(room => {
            this.rooms.set(room.id, room);
        });
    }
    
    // 🆕 ADVANCED AUTOMATION SYSTEM WITH TIMEOUTS
    setupAdvancedAutomations() {
        console.log('⏰ Setting up advanced automations with timeouts...');
        // Timeout automation is now handled in handleMotionTimeouts
    }
    
    // 🆕 MOTION TIMEOUT HANDLING
    handleMotionTimeouts(deviceId, newState) {
        const device = this.virtualDevices.get(deviceId);
        if (!device || device.type !== 'motion-sensor') return;

        const room = device.room;
        
        if (newState.motionDetected) {
            // Motion detected - clear any existing timeout
            this.clearRoomTimeout(room);
            console.log(`⏰ Cleared timeout for ${room} - motion detected`);
            
            // Notify clients that timeout was reset
            io.emit('motion-detected', { 
                room: room, 
                motionDetected: true,
                timeoutReset: true
            });
        } else {
            // No motion - start timeout if not already running
            this.scheduleRoomTimeout(room);
        }
    }
    
    clearRoomTimeout(room) {
        if (this.roomTimeouts.has(room)) {
            clearTimeout(this.roomTimeouts.get(room));
            this.roomTimeouts.delete(room);
            console.log(`⏰ Cleared existing timeout for ${room}`);
        }
    }
    
    scheduleRoomTimeout(room) {
        // Don't schedule if already scheduled
        if (this.roomTimeouts.has(room)) return;

        // Different timeouts for different rooms
        const timeoutConfig = {
            'living-room': 3 * 60 * 1000,    // 3 minutes
            'kitchen': 3 * 60 * 1000,        // 3 minutes  
            'bedroom': 5 * 60 * 1000,        // 5 minutes (longer for comfort)
            'bathroom': 3 * 60 * 1000,       // 3 minutes
            'entrance': 2 * 60 * 1000,       // 2 minutes
            'office': 5 * 60 * 1000          // 5 minutes
        };
        
        const timeoutDuration = timeoutConfig[room] || 3 * 60 * 1000; // Default 3 minutes
        
        const timeoutId = setTimeout(() => {
            console.log(`⏰ Timeout reached for ${room} - turning off light`);
            this.turnOffRoomLight(room);
            this.roomTimeouts.delete(room);
            
            // Notify clients
            io.emit('room-timeout-complete', { 
                room: room,
                message: `Light turned off in ${room}`
            });
        }, timeoutDuration);

        this.roomTimeouts.set(room, timeoutId);
        
        // Notify clients that timeout was started
        io.emit('room-timeout-started', { 
            room: room, 
            timeoutMinutes: timeoutDuration / 60000 
        });
        
        console.log(`⏰ Scheduled timeout for ${room} in ${timeoutDuration/60000} minutes`);
    }
    
    turnOffRoomLight(room) {
        // Find the light in this room
        for (const [deviceId, device] of this.virtualDevices) {
            if (device.type === 'light' && device.room === room) {
                // Turn off the light
                this.virtualDevices.set(deviceId, {
                    ...device,
                    state: { ...device.state, isOn: false, brightness: 0 }
                });

                // Notify all clients
                io.emit('device-state-update', {
                    deviceId: deviceId,
                    state: { isOn: false, brightness: 0 }
                });

                console.log(`💡 Turned off ${room} light due to timeout`);
                break;
            }
        }
    }
    
    // 🆕 CREATE TIMEOUT AUTOMATION
    createTimeoutAutomation(room, timeoutMinutes) {
        console.log(`⏰ Created timeout automation for ${room}: ${timeoutMinutes} minutes`);
        // The actual timeout logic is handled in handleMotionTimeouts
        return { room, timeoutMinutes };
    }
    
    registerDevice(deviceData, socketId) {
        console.log(`🔍 registerDevice called:`, {
            socketId: socketId,
            deviceData: deviceData,
            existingDevices: Array.from(this.virtualDevices.keys())
        });
        
        // Create a consistent device ID based on device type and room (not socket ID)
        const deviceId = `${deviceData.type}-${deviceData.room}`;
        console.log(`🔍 Generated deviceId: ${deviceId}`);
        
        // Check if device already exists and update it instead of creating new
        const existingDevice = this.virtualDevices.get(deviceId);
        
        if (existingDevice) {
            console.log(`🔍 Found existing device, updating:`, existingDevice.name);
            // Update existing device with new socket ID
            existingDevice.socketId = socketId;
            existingDevice.state = { 
                ...existingDevice.state, 
                isOnline: true, 
                lastSeen: Date.now(),
                ...deviceData.initialState 
            };
            console.log(`🏡 VirtualVilla: ${existingDevice.name} updated in ${existingDevice.room}`);
            return existingDevice;
        } else {
            console.log(`🔍 No existing device found, creating new one`);
            // Create new device
            const device = {
                id: deviceId,
                name: deviceData.name,
                type: deviceData.type,
                room: deviceData.room || 'living-room',
                capabilities: deviceData.capabilities,
                state: { 
                    isOnline: true, 
                    lastSeen: Date.now(),
                    ...deviceData.initialState 
                },
                socketId: socketId,
                created: new Date().toLocaleTimeString()
            };
            
            this.virtualDevices.set(device.id, device);
            
            // Add to room
            const room = this.rooms.get(device.room);
            if (room && !room.devices.includes(device.id)) {
                room.devices.push(device.id);
            }
            
            console.log(`🏡 VirtualVilla: ${device.name} registered in ${device.room}`);
            console.log(`🔍 Total devices now: ${this.virtualDevices.size}`);
            return device;
        }
    }
    
    updateDeviceState(deviceId, newState) {
        const device = this.virtualDevices.get(deviceId);
        if (device) {
            device.state = { ...device.state, ...newState, lastSeen: Date.now() };
            
            // 🆕 Check for motion sensor state changes to handle timeouts
            if (device.type === 'motion-sensor' && newState.motionDetected !== undefined) {
                this.handleMotionTimeouts(deviceId, newState);
            }
            
            this.checkAutomations(deviceId, newState);
            return device;
        }
        return null;
    }
    
    checkAutomations(deviceId, newState) {
        this.automations.forEach(automation => {
            if (this.evaluateTrigger(automation.trigger, deviceId, newState)) {
                console.log(`⚡ VirtualVilla: Automation "${automation.name}" triggered`);
                this.executeAutomation(automation);
            }
        });
    }
    
    evaluateTrigger(trigger, deviceId, newState) {
        // Simple trigger evaluation - will expand later
        if (trigger.type === 'device-state' && trigger.deviceId === deviceId) {
            return newState[trigger.stateKey] === trigger.stateValue;
        }
        return false;
    }
    
    executeAutomation(automation) {
        automation.actions.forEach(action => {
            io.emit('automation-action', action);
            
            // 🆕 Also update the device state directly for immediate feedback
            const device = this.virtualDevices.get(action.deviceId);
            if (device && action.action === 'turnOn' && device.type === 'light') {
                this.updateDeviceState(action.deviceId, { isOn: true, brightness: 100 });
            } else if (device && action.action === 'turnOff' && device.type === 'light') {
                this.updateDeviceState(action.deviceId, { isOn: false, brightness: 0 });
            }
        });
    }
    
    addAutomation(automation) {
        this.automations.push(automation);
        console.log(`⚡ VirtualVilla: Automation "${automation.name}" added`);
    }
    
    // 🆕 CREATE AUTOMATION (for motion-activated lighting)
    createAutomation(automation) {
        const automationId = `automation-${Date.now()}`;
        this.automations.push({
            id: automationId,
            ...automation
        });
        console.log(`🤖 Automation created: ${automation.name}`);
        return automationId;
    }
    
    getVillaStatus() {
        return {
            devices: Array.from(this.virtualDevices.values()),
            rooms: Array.from(this.rooms.values()),
            automations: this.automations.length,
            totalDevices: this.virtualDevices.size,
            activeTimeouts: this.roomTimeouts.size // 🆕 Include timeout info
        };
    }
    
    cleanupSocketDevices(socketId) {
        console.log(`🔍 cleanupSocketDevices called for socket: ${socketId}`);
        console.log(`🔍 Devices before cleanup:`, Array.from(this.virtualDevices.keys()));
        
        let removedCount = 0;
        this.virtualDevices.forEach((device, deviceId) => {
            if (device.socketId === socketId) {
                console.log(`🔍 Removing device: ${deviceId} - ${device.name}`);
                this.virtualDevices.delete(deviceId);
                removedCount++;
                
                // Also remove from room
                const room = this.rooms.get(device.room);
                if (room) {
                    room.devices = room.devices.filter(id => id !== deviceId);
                }
            }
        });
        
        if (removedCount > 0) {
            console.log(`🏡 Cleaned up ${removedCount} old devices from socket ${socketId}`);
        } else {
            console.log(`🔍 No devices to clean up for socket ${socketId}`);
        }
        
        console.log(`🔍 Devices after cleanup:`, Array.from(this.virtualDevices.keys()));
        return removedCount;
    }
}

// Initialize VirtualVilla
const villa = new VirtualVilla();

// Socket.IO Handlers
io.on('connection', (socket) => {
    console.log(`🏡 VirtualVilla: Client connected - ${socket.id}`);
    
    // Clean up old devices from this socket BEFORE sending status
    villa.cleanupSocketDevices(socket.id);
    
    // Send current villa status to new client
    socket.emit('villa-status', villa.getVillaStatus());
    
    // Device Registration
    socket.on('register-device', (deviceData) => {
        const device = villa.registerDevice(deviceData, socket.id);
        io.emit('device-registered', device);
        io.emit('villa-status', villa.getVillaStatus());
    });
    
    // Device State Updates
    socket.on('device-state-update', (data) => {
        const device = villa.updateDeviceState(data.deviceId, data.state);
        if (device) {
            io.emit('device-state-changed', {
                deviceId: data.deviceId,
                state: device.state
            });
            
            // 🆕 Also send motion-specific events
            if (device.type === 'motion-sensor' && data.state.motionDetected !== undefined) {
                io.emit('motion-detected', {
                    room: device.room,
                    motionDetected: data.state.motionDetected,
                    deviceId: data.deviceId
                });
            }
        }
    });
    
    // Automation Management
    socket.on('add-automation', (automation) => {
        villa.addAutomation(automation);
        io.emit('automation-added', automation);
    });
    
    // 🆕 CREATE AUTOMATION (for motion-activated lighting)
    socket.on('create-automation', (automation) => {
        const automationId = villa.createAutomation(automation);
        io.emit('automation-created', { ...automation, id: automationId });
        console.log(`🤖 Broadcast automation: ${automation.name}`);
    });
    
    // 🆕 TIMEOUT AUTOMATION CREATION
    socket.on('create-timeout-automation', (data) => {
        const timeoutAutomation = villa.createTimeoutAutomation(data.room, data.timeoutMinutes);
        io.emit('timeout-automation-created', timeoutAutomation);
        console.log(`⏰ Broadcast timeout automation for ${data.room}`);
    });
    
    // Handle disconnection
    socket.on('disconnect', () => {
        console.log(`🏡 VirtualVilla: Client disconnected - ${socket.id}`);
        // Mark devices as offline
        villa.virtualDevices.forEach(device => {
            if (device.socketId === socket.id) {
                device.state.isOnline = false;
            }
        });
        io.emit('villa-status', villa.getVillaStatus());
    });
});

server.listen(PORT, () => {
    console.log(`🏡 VirtualVilla Multi-Room System Running!`);
    console.log(`📍 Local: http://localhost:${PORT}`);
    console.log(`🌐 Network: http://[your-ip]:${PORT}`);
    console.log(`🚀 Features: 6 Rooms • Motion Sensors • Auto Timeouts • Smart Lighting`);
});