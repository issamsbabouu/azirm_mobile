import * as Location from 'expo-location';
import { api } from './api';
import { saveTrackingOffline } from './database';
import { Alert } from 'react-native';

// Location tracking interval in milliseconds
const TRACKING_INTERVAL = 60000; // 1 minute

// Cache for the last known location
let lastKnownLocation = null;
let watchPositionSubscription = null;
let trackingInterval = null;

// Request location permissions
export const requestLocationPermissions = async () => {
  try {
    const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
    
    if (foregroundStatus !== 'granted') {
      Alert.alert(
        'Location Permissions Required',
        'AZIRM Collector needs access to your location for tracking your collection route.',
        [{ text: 'OK' }]
      );
      return false;
    }
    
    // Request background permissions if available on this device
    if (Location.requestBackgroundPermissionsAsync) {
      const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
      
      if (backgroundStatus !== 'granted') {
        Alert.alert(
          'Background Location',
          'Background location tracking not enabled. The app will only track your location while it is open.',
          [{ text: 'OK' }]
        );
      }
    }
    
    return true;
  } catch (error) {
    console.error('Error requesting location permissions:', error);
    return false;
  }
};

// Get current position
export const getCurrentPosition = async () => {
  try {
    const hasPermission = await requestLocationPermissions();
    
    if (!hasPermission) {
      throw new Error('Location permission not granted');
    }
    
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced
    });
    
    lastKnownLocation = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      timestamp: new Date().getTime()
    };
    
    return lastKnownLocation;
  } catch (error) {
    console.error('Error getting current position:', error);
    throw error;
  }
};

// Start watching position changes
export const startLocationTracking = async (userId, missionId) => {
  try {
    const hasPermission = await requestLocationPermissions();
    
    if (!hasPermission) {
      throw new Error('Location permission not granted');
    }
    
    // Clear any existing tracking
    stopLocationTracking();
    
    // Start watching position
    watchPositionSubscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval: 10, // minimum change (in meters) to trigger an update
        timeInterval: 5000, // minimum time interval between updates (5 seconds)
      },
      (location) => {
        // Update last known location
        lastKnownLocation = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          timestamp: new Date().getTime()
        };
      }
    );
    
    // Start tracking interval to send location updates
    trackingInterval = setInterval(() => {
      if (lastKnownLocation) {
        sendLocationUpdate(lastKnownLocation, userId, missionId);
      }
    }, TRACKING_INTERVAL);
    
    return true;
  } catch (error) {
    console.error('Error starting location tracking:', error);
    return false;
  }
};

// Stop watching position
export const stopLocationTracking = () => {
  if (watchPositionSubscription) {
    watchPositionSubscription.remove();
    watchPositionSubscription = null;
  }
  
  if (trackingInterval) {
    clearInterval(trackingInterval);
    trackingInterval = null;
  }
};

// Send location update to server or store locally
export const sendLocationUpdate = async (coords, userId, missionId = null) => {
  try {
    const trackingData = {
      userId,
      missionId,
      location: {
        latitude: coords.latitude,
        longitude: coords.longitude
      },
      timestamp: new Date()
    };
    
    // Try to send to server
    const response = await api.post('/tracking', trackingData);
    
    // If failed, store locally
    if (!response.success) {
      await saveTrackingOffline(trackingData);
    }
    
    return true;
  } catch (error) {
    console.error('Error sending location update:', error);
    
    // Store locally on error
    try {
      const trackingData = {
        userId,
        missionId,
        location: {
          latitude: coords.latitude,
          longitude: coords.longitude
        },
        timestamp: new Date()
      };
      
      await saveTrackingOffline(trackingData);
    } catch (innerError) {
      console.error('Error saving tracking data offline:', innerError);
    }
    
    return false;
  }
};

// Calculate distance between two coordinates in kilometers
export const calculateDistance = (coords1, coords2) => {
  if (!coords1 || !coords2) return 0;
  
  const lat1 = coords1.latitude;
  const lon1 = coords1.longitude;
  const lat2 = coords2.latitude;
  const lon2 = coords2.longitude;
  
  const R = 6371; // Radius of the earth in km
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in km
  
  return distance;
};

// Convert degrees to radians
const deg2rad = (deg) => {
  return deg * (Math.PI / 180);
};

// Format distance for display
export const formatDistance = (distanceKm) => {
  if (distanceKm < 1) {
    // Convert to meters if less than 1 km
    const meters = Math.round(distanceKm * 1000);
    return `${meters} m`;
  } else {
    // Round to 1 decimal place
    return `${distanceKm.toFixed(1)} km`;
  }
};