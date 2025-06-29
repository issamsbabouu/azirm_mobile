import { Platform, Alert } from 'react-native';
import { api } from './api';
import { saveVisitOffline } from './database';

// Functions for handling payment processes

// Process card payment
export const processCardPayment = async (paymentData) => {
  try {
    // In a production app, this would integrate with Square SDK
    // For demo purposes, we'll use a simulated flow
    
    console.log('Payment processing initiated:', paymentData);
    
    // Simulate payment processing delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Generate a mock transaction ID
    const mockTransactionId = `sq_${Math.random().toString(36).substring(2, 15)}`;
    
    // Create a successful response
    const paymentResponse = {
      success: true,
      transactionId: mockTransactionId,
      amount: paymentData.amount,
      visitId: paymentData.visitId
    };
    
    // In a real app, record payment to server
    const response = await api.post('/payments', {
      visitId: paymentData.visitId,
      amount: paymentData.amount,
      transactionId: mockTransactionId,
      method: 'card'
    });
    
    if (!response.success) {
      // Save offline if server request fails
      await savePaymentOffline({
        visitId: paymentData.visitId,
        amount: paymentData.amount,
        transactionId: mockTransactionId,
        method: 'card',
        timestamp: new Date()
      });
    }
    
    return paymentResponse;
  } catch (error) {
    console.error('Payment processing error:', error);
    
    // Save offline on error
    try {
      const mockTransactionId = `sq_offline_${Math.random().toString(36).substring(2, 15)}`;
      
      await savePaymentOffline({
        visitId: paymentData.visitId,
        amount: paymentData.amount,
        transactionId: mockTransactionId,
        method: 'card',
        timestamp: new Date()
      });
      
      return {
        success: true,
        transactionId: mockTransactionId,
        amount: paymentData.amount,
        visitId: paymentData.visitId,
        offline: true
      };
    } catch (offlineError) {
      console.error('Failed to save payment offline:', offlineError);
      return {
        success: false,
        error: 'Failed to process payment and save offline.'
      };
    }
  }
};

// Process cash payment
export const processCashPayment = async (paymentData) => {
  try {
    // Create payment record for cash
    const response = await api.post('/payments', {
      visitId: paymentData.visitId,
      amount: paymentData.amount,
      transactionId: null,
      method: 'cash'
    });
    
    if (!response.success) {
      // Save offline if server request fails
      await savePaymentOffline({
        visitId: paymentData.visitId,
        amount: paymentData.amount,
        transactionId: null,
        method: 'cash',
        timestamp: new Date()
      });
    }
    
    return {
      success: true,
      amount: paymentData.amount,
      visitId: paymentData.visitId,
      method: 'cash'
    };
  } catch (error) {
    console.error('Cash payment recording error:', error);
    
    // Save offline on error
    try {
      await savePaymentOffline({
        visitId: paymentData.visitId,
        amount: paymentData.amount,
        transactionId: null,
        method: 'cash',
        timestamp: new Date()
      });
      
      return {
        success: true,
        amount: paymentData.amount,
        visitId: paymentData.visitId,
        method: 'cash',
        offline: true
      };
    } catch (offlineError) {
      console.error('Failed to save cash payment offline:', offlineError);
      return {
        success: false,
        error: 'Failed to record cash payment and save offline.'
      };
    }
  }
};

// Save payment data offline
const savePaymentOffline = async (paymentData) => {
  try {
    // In a real app, this would save to local database
    // For demo, we'll log it
    console.log('Payment saved offline:', paymentData);
    return true;
  } catch (error) {
    console.error('Failed to save payment offline:', error);
    throw error;
  }
};

// Initialize payment processing
export const initializePaymentProcessing = async () => {
  try {
    // In a real app, this would initialize Square SDK or other payment processors
    console.log('Payment processing initialized');
    return true;
  } catch (error) {
    console.error('Failed to initialize payment processing:', error);
    return false;
  }
};

// Calculate commission based on payment amount
export const calculateCommission = (amount, commissionRate = 0.1) => {
  return parseFloat((amount * commissionRate).toFixed(2));
};

// Format currency for display
export const formatCurrency = (amount, currency = 'USD') => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2
  }).format(amount);
};