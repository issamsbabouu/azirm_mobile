// LoginScreen.jsx - version sombre harmonisée
import React, { useState, useEffect } from 'react';
import {
  View, Text, Image, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { supabase } from '../supabase';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { FontAwesome5 } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const primaryColor = '#7078DC';
const secondaryColor = '#8F71C1';

const LoginScreen = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const { login, isLoading, user, userName, isAuthenticated } = useAuth();
  const navigation = useNavigation();

  useEffect(() => {
    if (isAuthenticated && user) {
      navigation.replace('Dashboard');
    }
  }, [isAuthenticated, user]);

  useEffect(() => {
    const loadSavedCredentials = async () => {
      try {
        const savedEmail = await AsyncStorage.getItem('email');
        const savedPassword = await AsyncStorage.getItem('password');
        if (savedEmail && savedPassword) {
          setEmail(savedEmail);
          setPassword(savedPassword);
          setRememberMe(true);
        }
      } catch (error) {
        console.log("Erreur chargement credentials:", error);
      }
    };
    loadSavedCredentials();
  }, []);

  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const handleLogin = async () => {
    if (!email.trim() || !validateEmail(email.trim()) || !password) {
      Alert.alert('Erreur', 'Veuillez remplir correctement les champs');
      return;
    }
    try {
      await login(email.trim(), password);
      if (rememberMe) {
        await AsyncStorage.setItem('email', email.trim());
        await AsyncStorage.setItem('password', password);
      } else {
        await AsyncStorage.removeItem('email');
        await AsyncStorage.removeItem('password');
      }
    } catch (error) {
      console.error('Erreur connexion:', error);
      let errorMessage = 'Erreur lors de la connexion';
      if (error.message.includes('incorrect')) {
        errorMessage = 'Email ou mot de passe incorrect';
      }
      Alert.alert('Connexion échouée', errorMessage);
    }
  };

  return (
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            <View style={styles.logoContainer}>
              <Image source={require('../../assets/logo_whte.png')} style={styles.logo} resizeMode="contain" />
              <Text style={styles.welcomeText}>Bienvenue !</Text>
              <Text style={styles.subtitleText}>Connectez-vous pour continuer</Text>
            </View>

            <View style={styles.loginCard}>
              <View style={[styles.inputContainer, !validateEmail(email) && email.length > 0 && styles.inputError]}>
                <FontAwesome5 name="envelope" size={16} color={!validateEmail(email) && email.length > 0 ? "#EF4444" : "#A0A0A0"} style={styles.icon} />
                <TextInput
                    style={styles.input}
                    placeholder="Adresse email"
                    placeholderTextColor="#888"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                />
              </View>
              {!validateEmail(email) && email.length > 0 && (
                  <Text style={styles.errorText}>Format d'email invalide</Text>
              )}

              <View style={styles.inputContainer}>
                <FontAwesome5 name="lock" size={16} color="#A0A0A0" style={styles.icon} />
                <TextInput
                    style={styles.input}
                    placeholder="Mot de passe"
                    placeholderTextColor="#888"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!passwordVisible}
                />
                <TouchableOpacity onPress={() => setPasswordVisible(!passwordVisible)}>
                  <FontAwesome5 name={passwordVisible ? "eye-slash" : "eye"} size={16} color="#A0A0A0" />
                </TouchableOpacity>
              </View>

              <View style={styles.options}>
                <TouchableOpacity style={styles.rememberMe} onPress={() => setRememberMe(!rememberMe)}>
                  <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
                    {rememberMe && <FontAwesome5 name="check" size={10} color="white" />}
                  </View>
                  <Text style={styles.rememberMeText}>Se souvenir de moi</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                  style={[styles.loginButton, (!email.trim() || !password || !validateEmail(email.trim())) && styles.buttonDisabled]}
                  onPress={handleLogin}
                  disabled={!email.trim() || !password || !validateEmail(email.trim())}
              >
                {isLoading ? (
                    <View style={styles.loadingContainer}>
                      <ActivityIndicator color="white" size="small" />
                      <Text style={[styles.buttonText, { marginLeft: 10 }]}>Connexion...</Text>
                    </View>
                ) : (
                    <>
                      <FontAwesome5 name="sign-in-alt" size={16} color="white" style={{ marginRight: 8 }} />
                      <Text style={styles.buttonText}>Se connecter</Text>
                    </>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.helpContainer}>
              <TouchableOpacity style={styles.helpButton} onPress={() => setHelpVisible(true)}>
                <FontAwesome5 name="question-circle" size={16} color={primaryColor} />
                <Text style={styles.helpText}>Besoin d'aide ?</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>

        {helpVisible && (
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <FontAwesome5 name="question-circle" size={48} color={primaryColor} style={{ marginBottom: 16 }} />
                <Text style={styles.modalTitle}>Aide à la connexion</Text>
                <Text style={styles.modalText}>
                  Si vous rencontrez des difficultés :{"\n\n"}
                  • Vérifiez votre email et mot de passe{"\n"}
                  • Assurez-vous d'avoir une connexion internet{"\n"}
                  • Contactez le support si le problème persiste
                </Text>
                <TouchableOpacity style={styles.closeButton} onPress={() => setHelpVisible(false)}>
                  <Text style={styles.closeButtonText}>Compris</Text>
                </TouchableOpacity>
              </View>
            </View>
        )}
      </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, justifyContent: 'center', padding: 20, paddingBottom: 40 },
  logoContainer: { alignItems: 'center', marginBottom: 40 },
  logo: { width: 200, height: 100, marginBottom: 16 },
  welcomeText: { fontSize: 24, fontWeight: 'bold', color: '#FFF', marginBottom: 4 },
  subtitleText: { fontSize: 16, color: '#A1A1AA', textAlign: 'center' },
  loginCard: {
    backgroundColor: '#1C1C1E', borderRadius: 16, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1,
    shadowRadius: 8, elevation: 5, marginBottom: 20,
  },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#2A2A2E',
    borderWidth: 1, borderColor: '#4B4B4D', borderRadius: 12,
    paddingHorizontal: 16, marginBottom: 4, minHeight: 50,
  },
  inputError: { borderColor: '#EF4444', backgroundColor: '#3A1A1A' },
  icon: { marginRight: 12 },
  input: { flex: 1, height: 50, color: '#FFF', fontSize: 16 },
  errorText: { color: '#EF4444', fontSize: 12, marginBottom: 12, marginLeft: 4 },
  options: { flexDirection: 'row', justifyContent: 'flex-start', marginBottom: 24, marginTop: 12 },
  rememberMe: { flexDirection: 'row', alignItems: 'center' },
  checkbox: {
    width: 18, height: 18, borderRadius: 4, borderWidth: 1, borderColor: '#D1D5DB',
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  checkboxChecked: { backgroundColor: secondaryColor, borderColor: secondaryColor },
  rememberMeText: { color: '#CCC', fontSize: 14 },
  loginButton: {
    backgroundColor: primaryColor, borderRadius: 12, height: 50,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    marginBottom: 16, shadowColor: primaryColor, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 3,
  },
  buttonDisabled: { opacity: 0.6, shadowOpacity: 0, elevation: 0 },
  buttonText: { color: 'white', fontWeight: '600', fontSize: 16 },
  loadingContainer: { flexDirection: 'row', alignItems: 'center' },
  helpContainer: { alignItems: 'center', marginTop: 10 },
  helpButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12 },
  helpText: { color: secondaryColor, fontSize: 14, marginLeft: 8, fontWeight: '500' },
  modalOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center', zIndex: 999,
  },
  modalContent: {
    backgroundColor: '#1C1C1E', borderRadius: 20, padding: 24, width: '85%',
    alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25, shadowRadius: 4, elevation: 5,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFF', marginBottom: 12, textAlign: 'center' },
  modalText: { fontSize: 16, color: '#DDD', textAlign: 'left', marginBottom: 20 },
  closeButton: { backgroundColor: primaryColor, paddingVertical: 10, paddingHorizontal: 30, borderRadius: 8 },
  closeButtonText: { color: 'white', fontSize: 16, fontWeight: '600' },
});

export default LoginScreen;
